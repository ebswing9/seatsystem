/* ==========================================
   학생 메인 로직 (오리지널 복원 버전)
========================================== */

let currentStudentId = null;
let currentStudentPw = null;
let gameState = "WAIT"; 
let currentCaptcha = "자리확정";
let targetSeatId = null;

document.getElementById("btn-login").addEventListener("click", async () => {
  const idInput = document.getElementById("student-id").value.trim();
  const pwInput = document.getElementById("student-pw").value.trim();
  const error = document.getElementById("login-error");
  error.innerText = "";

  if (!idInput || !pwInput) {
    error.innerText = "번호와 비밀번호를 모두 입력하세요.";
    return;
  }

  try {
    const snap = await db.ref(`${PATH.STUDENTS}/${idInput}`).once("value");
    const student = snap.val();

    if (!student) {
      error.innerText = "등록되지 않은 번호입니다.";
      return;
    }

    if (String(pwInput) !== String(student.password)) {
      error.innerText = "비밀번호가 틀렸습니다.";
      return;
    }

    currentStudentId = idInput;
    currentStudentPw = pwInput;

    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("main-view").classList.remove("hidden");
    document.getElementById("display-student-info").innerText = `${currentStudentId}번 학생 패널`;

    await db.ref(`${PATH.STUDENTS}/${currentStudentId}`).update({ status: STUDENT_STATE.ONLINE });
    
    window.addEventListener("beforeunload", () => {
      db.ref(`${PATH.STUDENTS}/${currentStudentId}`).once("value", (s) => {
        const data = s.val();
        if (data && data.status !== STUDENT_STATE.DONE) {
          db.ref(`${PATH.STUDENTS}/${currentStudentId}`).update({ status: STUDENT_STATE.OFFLINE });
        }
      });
    });

    initStudentWorkspace();

  } catch (err) {
    error.innerText = "로그인 오류: " + err.message;
  }
});

function initStudentWorkspace() {
  listenGameStatus();
  listenSeatsData();
}

function listenGameStatus() {
  db.ref(`${PATH.GAME}`).on("value", (snap) => {
    const game = snap.val() || {};
    gameState = game.state || GAME_STATE.WAIT;
    currentCaptcha = game.captcha || DEFAULT_CAPTCHA;

    const statusBadge = document.getElementById("ticket-status");
    if (!statusBadge) return;

    if (gameState === GAME_STATE.WAIT) {
      statusBadge.innerText = "티켓팅 대기 중 (관리자가 시작하기를 기다려주세요)";
      statusBadge.style.color = "#868e96";
    } else if (gameState === GAME_STATE.OPEN) {
      statusBadge.innerText = "티켓팅 진행 중! 원하는 자리를 선택하세요.";
      statusBadge.style.color = "#2d6cdf";
    } else if (gameState === GAME_STATE.END) {
      statusBadge.innerText = "티켓팅이 종료되었습니다.";
      statusBadge.style.color = "#d9534f";
    }
  });
}

function listenSeatsData() {
  db.ref(`${PATH.SEATS}`).on("value", (snap) => {
    const seats = snap.val() || {};
    const container = document.getElementById("seat-grid");
    if (!container) return;
    container.innerHTML = "";

    for (const id in seats) {
      const seat = seats[id];
      const div = document.createElement("div");
      div.className = "seat";

      if (seat.locked) {
        div.classList.add("locked");
        div.innerText = "🔒";
      } else if (seat.owner) {
        div.classList.add("taken");
        if (String(seat.owner) === String(currentStudentId)) {
          div.classList.remove("taken");
          div.classList.add("my-seat");
          div.innerText = `${id}\n(내 자리)`;
        } else {
          div.innerText = "선점됨";
        }
      } else {
        div.innerText = id;
      }

      div.addEventListener("click", () => {
        if (gameState !== GAME_STATE.OPEN) {
          alert("지금은 티켓팅 기간이 아닙니다.");
          return;
        }
        if (seat.locked) {
          alert("이 좌석은 잠겨있습니다.");
          return;
        }
        if (seat.owner) {
          alert("이미 선점된 좌석입니다.");
          return;
        }

        targetSeatId = id;
        openCaptchaModal();
      });

      container.appendChild(div);
    }
  });
}

const modal = document.getElementById("captcha-modal");
const captchaWordDisplay = document.getElementById("captcha-word");
const captchaInput = document.getElementById("captcha-input");

function openCaptchaModal() {
  if (!modal) return;
  captchaWordDisplay.innerText = currentCaptcha;
  captchaInput.value = "";
  modal.classList.remove("hidden");
  captchaInput.focus();
}

function closeCaptchaModal() {
  if (modal) modal.classList.add("hidden");
}

const btnCloseModal = document.getElementById("btn-close-modal");
if (btnCloseModal) {
  btnCloseModal.addEventListener("click", closeCaptchaModal);
}

document.getElementById("btn-confirm-captcha").addEventListener("click", async () => {
  // firebase.js에 있는 checkCaptcha 함수 활용
  if (!checkCaptcha(captchaInput.value, currentCaptcha)) {
    alert("인증 단어가 올바르지 않습니다.");
    captchaInput.focus();
    return;
  }

  closeCaptchaModal();

  const seatRef = db.ref(`${PATH.SEATS}/${targetSeatId}`);
  try {
    const result = await seatRef.transaction((currentData) => {
      if (currentData === null) return { locked: false, owner: currentStudentId };
      if (currentData.owner || currentData.locked) return undefined;
      currentData.owner = currentStudentId;
      return currentData;
    });

    if (!result.committed) {
      alert("이미 다른 학생이 선점했습니다.");
      return;
    }

    const seatsRef = db.ref(`${PATH.SEATS}`);
    const seatsSnap = await seatsRef.once("value");
    const allSeats = seatsSnap.val() || {};
    
    for (const seatKey in allSeats) {
      if (seatKey !== targetSeatId && String(allSeats[seatKey].owner) === String(currentStudentId)) {
        await seatsRef.child(seatKey).update({ owner: null });
      }
    }

    await db.ref(`${PATH.STUDENTS}/${currentStudentId}`).update({ seat: targetSeatId, status: STUDENT_STATE.DONE });
    alert(`${targetSeatId} 자리가 확정되었습니다!`);

  } catch (error) {
    alert("예약 오류: " + error.message);
  }
});

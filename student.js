/* =========================
   [안전장치] 전역 변수 중복 선언 방지
   let이나 const 대신 전역 객체(window)를 활용해 충돌을 원천 차단합니다.
========================= */
if (!window.PATH) window.PATH = { STUDENTS: "students", GAME: "game", SEATS: "seats" };
if (!window.GAME_STATE) window.GAME_STATE = { WAIT: "WAIT", OPEN: "OPEN", END: "END" };
if (!window.STUDENT_STATE) window.STUDENT_STATE = { ONLINE: "ONLINE", OFFLINE: "OFFLINE", DONE: "DONE" };
if (!window.DEFAULT_CAPTCHA) window.DEFAULT_CAPTCHA = "자리확정";

// 전역 스코프 안전 바인딩
let currentStudentId = null;
let currentStudentPw = null;
let gameState = window.GAME_STATE.WAIT;
let currentCaptcha = window.DEFAULT_CAPTCHA;
let targetSeatId = null;

/* =========================
   학생 로그인 및 초기 진입
========================= */
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
    if (typeof db === "undefined") {
      alert("데이터베이스(db)가 연결되지 않았습니다. firebase.js 설정을 확인하세요.");
      return;
    }

    // 학생 정보 조회
    const snap = await db.ref(`${window.PATH.STUDENTS}/${idInput}`).once("value");
    const student = snap.val();

    if (!student) {
      error.innerText = "등록되지 않은 번호입니다.";
      return;
    }

    // 비밀번호 비교 (문자열 강제 형변환 비교로 타입 에러 방지)
    if (String(pwInput) !== String(student.password)) {
      error.innerText = "비밀번호가 틀렸습니다.";
      return;
    }

    // 로그인 성공 시 전역 변수 저장 및 화면 전환
    currentStudentId = idInput;
    currentStudentPw = pwInput;

    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("main-view").classList.remove("hidden");
    document.getElementById("display-student-info").innerText = `${currentStudentId}번 학생 대시보드`;

    // 온라인 상태 업데이트 및 실시간 리스너 시작
    await db.ref(`${window.PATH.STUDENTS}/${currentStudentId}`).update({ status: window.STUDENT_STATE.ONLINE });
    
    // 페이지 종료/새로고침 시 오프라인 처리 (단, 확정된 상태면 DONE 유지)
    window.addEventListener("beforeunload", () => {
      db.ref(`${window.PATH.STUDENTS}/${currentStudentId}`).once("value", (s) => {
        const data = s.val();
        if (data && data.status !== window.STUDENT_STATE.DONE) {
          db.ref(`${window.PATH.STUDENTS}/${currentStudentId}`).update({ status: window.STUDENT_STATE.OFFLINE });
        }
      });
    });

    initStudentWorkspace();

  } catch (err) {
    error.innerText = "로그인 오류: " + err.message;
    console.error(err);
  }
});

/* =========================
   실시간 동기화 시작
========================= */
function initStudentWorkspace() {
  listenGameStatus();
  listenSeatsData();
}

/* =========================
   게임 상태 및 상단 헤더 동기화
========================= */
function listenGameStatus() {
  db.ref(`${window.PATH.GAME}`).on("value", (snap) => {
    const game = snap.val() || {};
    gameState = game.state || window.GAME_STATE.WAIT;
    currentCaptcha = game.captcha || window.DEFAULT_CAPTCHA;

    const statusBadge = document.getElementById("ticket-status");
    if (!statusBadge) return;

    if (gameState === window.GAME_STATE.WAIT) {
      statusBadge.innerText = "티켓팅 대기 중 (관리자가 시작하기를 기다려주세요)";
      statusBadge.style.color = "#868e96";
    } else if (gameState === window.GAME_STATE.OPEN) {
      statusBadge.innerText = "티켓팅 진행 중! 원하는 자리를 선택하세요.";
      statusBadge.style.color = "#2d6cdf";
    } else if (gameState === window.GAME_STATE.END) {
      statusBadge.innerText = "티켓팅이 종료되었습니다.";
      statusBadge.style.color = "#d9534f";
    }
  });
}

/* =========================
   좌석 실시간 렌더링 및 클릭 이벤트
========================= */
function listenSeatsData() {
  db.ref(`${window.PATH.SEATS}`).on("value", (snap) => {
    const seats = snap.val() || {};
    const container = document.getElementById("seat-grid");
    if (!container) return;
    container.innerHTML = "";

    for (const id in seats) {
      const seat = seats[id];
      const div = document.createElement("div");
      div.className = "seat";

      // 요구사항에 맞춘 시각적 클래스 분기
      if (seat.locked) {
        div.classList.add("locked");
        div.innerText = "🔒";
      } else if (seat.owner) {
        div.classList.add("taken");
        if (String(seat.owner) === String(currentStudentId)) {
          // 내 자리인 경우 파란색 표시
          div.classList.remove("taken");
          div.classList.add("my-seat");
          div.innerText = `${id}\n(내 자리)`;
        } else {
          // 남의 자리인 경우 회색 표시
          div.innerText = "선점됨";
        }
      } else {
        div.innerText = id; // 빈자리
      }

      // 좌석 클릭 이벤트
      div.addEventListener("click", () => {
        if (gameState !== window.GAME_STATE.OPEN) {
          alert("지금은 티켓팅 기간이 아닙니다.");
          return;
        }
        if (seat.locked) {
          alert("이 좌석은 관리자에 의해 잠겨있습니다.");
          return;
        }
        if (seat.owner) {
          if (String(seat.owner) === String(currentStudentId)) {
            alert("이미 이 자리를 선택하셨습니다.");
          } else {
            alert("이미 다른 학생이 선점한 좌석입니다.");
          }
          return;
        }

        // 빈자리일 경우 모달창 띄우기
        targetSeatId = id;
        openCaptchaModal();
      });

      container.appendChild(div);
    }
  });
}

/* =========================
   인증 문구 입력 모달창 제어
========================= */
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

// 모달 닫기 버튼 이벤트
const btnCloseModal = document.getElementById("btn-close-modal");
if (btnCloseModal) {
  btnCloseModal.addEventListener("click", closeCaptchaModal);
}

// 인증 확인 버튼 클릭 시 최종 예약 처리 (트랜잭션 적용)
document.getElementById("btn-confirm-captcha").addEventListener("click", async () => {
  const userInput = captchaInput.value.trim();
  if (userInput !== currentCaptcha) {
    alert("인증 단어가 올바르지 않습니다. 다시 입력해 주세요.");
    captchaInput.value = "";
    captchaInput.focus();
    return;
  }

  closeCaptchaModal();

  // 파이어베이스 트랜잭션으로 중복 예약 완벽 방지
  const seatRef = db.ref(`${window.PATH.SEATS}/${targetSeatId}`);
  try {
    const result = await seatRef.transaction((currentData) => {
      if (currentData === null) return { locked: false, owner: currentStudentId };
      if (currentData.owner || currentData.locked) {
        return undefined; // 이미 주인이 생겼거나 잠겼다면 트랜잭션 취소
      }
      currentData.owner = currentStudentId;
      return currentData;
    });

    if (!result.committed) {
      alert("이미 선택된 좌석입니다.");
      return;
    }

    // 내 기존 자리가 있었다면 지워주기 (1인 1자리 보장)
    const studentsRef = db.ref(`${window.PATH.STUDENTS}`);
    const seatsRef = db.ref(`${window.PATH.SEATS}`);
    
    const seatsSnap = await seatsRef.once("value");
    const allSeats = seatsSnap.val() || {};
    
    for (const seatKey in allSeats) {
      if (seatKey !== targetSeatId && String(allSeats[seatKey].owner) === String(currentStudentId)) {
        await seatsRef.child(seatKey).update({ owner: null });
      }
    }

    // 학생 상태를 DONE으로 변경하여 확정 처리
    await studentsRef.child(currentStudentId).update({ seat: targetSeatId, status: window.STUDENT_STATE.DONE });
    alert(`${targetSeatId} 배정이 성공적으로 확정되었습니다! 🎉`);

  } catch (error) {
    alert("티켓팅 처리 중 오류 발생: " + error.message);
  }
});
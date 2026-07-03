/* ==========================================
   관리자 로그인 및 제어 패널 (오리지널 복원 버전)
========================================== */

document.getElementById("btn-admin-login").addEventListener("click", async () => {
  const pw = document.getElementById("admin-pw").value.trim();
  const error = document.getElementById("admin-login-error");
  error.innerText = "";

  try {
    // firebase.js에 선언된 db와 PATH를 그대로 사용합니다.
    const snap = await db.ref(`${PATH.GAME}/adminPassword`).once("value");
    const realPw = snap.val();

    if (!realPw) {
      error.innerText = "관리자 비밀번호가 설정되지 않았습니다.";
      return;
    }

    if (String(pw) !== String(realPw)) {
      error.innerText = "비밀번호가 틀렸습니다.";
      return;
    }

    document.getElementById("admin-login-view").classList.add("hidden");
    document.getElementById("admin-view").classList.remove("hidden");
    
    initAdmin();

  } catch (err) {
    error.innerText = "오류가 발생했습니다: " + err.message;
  }
});

function initAdmin() {
  listenStudents();
  listenSeats();
  listenGame();
}

// 1~29번 학생 자동 생성
const btnGenerate = document.getElementById("btn-generate-students");
if (btnGenerate) {
  btnGenerate.addEventListener("click", async () => {
    const defaultPwInput = document.getElementById("default-student-pw").value.trim();
    if (!defaultPwInput) {
      alert("학생용 초기 비밀번호를 입력하세요.");
      return;
    }

    if (!confirm("1~29번 학생 계정을 자동 생성하시겠습니까?")) return;

    const studentsData = {};
    for (let i = 1; i <= 29; i++) {
      studentsData[i] = {
        password: String(defaultPwInput),
        seat: null,
        status: STUDENT_STATE.OFFLINE
      };
    }

    try {
      await db.ref(`${PATH.STUDENTS}`).set(studentsData);
      alert("학생 계정이 생성되었습니다!");
    } catch (e) { alert(e.message); }
  });
}

// 게임 상태 제어 버튼들
document.getElementById("btn-start").addEventListener("click", async () => {
  try {
    await db.ref(`${PATH.GAME}`).update({ state: GAME_STATE.OPEN });
    alert("티켓팅 시작!");
  } catch(e) { alert(e.message); }
});

document.getElementById("btn-end").addEventListener("click", async () => {
  try {
    await db.ref(`${PATH.GAME}`).update({ state: GAME_STATE.END });
    alert("티켓팅 종료!");
  } catch(e) { alert(e.message); }
});

document.getElementById("btn-reset").addEventListener("click", async () => {
  if (!confirm("전체 초기화하시겠습니까?")) return;
  try {
    await db.ref(`${PATH.GAME}`).update({ state: GAME_STATE.WAIT, captcha: DEFAULT_CAPTCHA });
    
    const studentSnap = await db.ref(`${PATH.STUDENTS}`).once("value");
    const currentStudents = studentSnap.val() || {};
    for (const id in currentStudents) {
      currentStudents[id].seat = null;
      currentStudents[id].status = STUDENT_STATE.OFFLINE;
    }
    await db.ref(`${PATH.STUDENTS}`).set(currentStudents);
    
    // firebase.js의 generateSeats() 함수 호출
    await db.ref(`${PATH.SEATS}`).set(generateSeats());
    alert("초기화 완료!");
  } catch(e) { alert(e.message); }
});

document.getElementById("btn-set-captcha").addEventListener("click", async () => {
  const value = document.getElementById("captcha-admin").value.trim();
  if (!value) return;
  try {
    await db.ref(`${PATH.GAME}`).update({ captcha: value });
    alert("인증 단어 변경 완료!");
  } catch(e) { alert(e.message); }
});

function listenStudents() {
  db.ref(`${PATH.STUDENTS}`).on("value", (snap) => {
    const data = snap.val() || {};
    const listDisplay = document.getElementById("student-list");
    const listManage = document.getElementById("admin-student-list-manage");

    if (listDisplay) listDisplay.innerHTML = "";
    if (listManage) listManage.innerHTML = "";

    let onlineCount = 0;
    let totalCount = 0;

    for (const id in data) {
      totalCount++;
      if (data[id].status === STUDENT_STATE.ONLINE || data[id].status === STUDENT_STATE.DONE) onlineCount++;

      const div = document.createElement("div");
      div.innerText = `[${id}번] 상태: ${data[id].status || "OFFLINE"} | 좌석: ${data[id].seat || "-"}`;
      if (listDisplay) listDisplay.appendChild(div);

      if (listManage) {
        const manageDiv = document.createElement("div");
        manageDiv.innerText = `번호: ${id}번 | 비번: ${data[id].password}`;
        listManage.appendChild(manageDiv);
      }
    }
    if (document.getElementById("connect-count")) {
      document.getElementById("connect-count").innerText = `${onlineCount} / ${totalCount}`;
    }
  });
}

function listenSeats() {
  db.ref(`${PATH.SEATS}`).on("value", (snap) => {
    const seats = snap.val() || {};
    const container = document.getElementById("admin-seat-grid");
    if (!container) return;
    container.innerHTML = "";

    for (const id in seats) {
      const seat = seats[id];
      const div = document.createElement("div");
      div.className = "seat";

      if (seat.locked) div.classList.add("locked");
      if (seat.owner) div.classList.add("taken");

      div.innerText = seat.locked ? "🔒" : (seat.owner ? `${id}\n(${seat.owner}번)` : id);

      div.addEventListener("click", async () => {
        if (seat.owner) {
          if (!confirm("선택을 취소하시겠습니까?")) return;
          await db.ref(`${PATH.STUDENTS}/${seat.owner}`).update({ seat: null, status: STUDENT_STATE.ONLINE });
        }
        await db.ref(`${PATH.SEATS}/${id}`).update({ locked: !seat.locked, owner: null });
      });
      container.appendChild(div);
    }
  });
}

function listenGame() {
  db.ref(`${PATH.GAME}`).on("value", (snap) => {
    const game = snap.val();
    if (!game) return;
    let status = game.state === GAME_STATE.OPEN ? "진행 중" : (game.state === GAME_STATE.END ? "종료됨" : "대기 중");
    const target = document.getElementById("captcha-status");
    if (target) target.innerText = `상태: [ ${status} ] / 단어: [ ${game.captcha || DEFAULT_CAPTCHA} ]`;
  });
}

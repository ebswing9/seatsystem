/* =========================
   [안전장치] 전역 변수 중복 선언 방지
   let이나 const 대신 전역 객체(window)를 활용해 충돌을 원천 차단합니다.
========================= */
if (!window.PATH) window.PATH = { STUDENTS: "students", GAME: "game", SEATS: "seats" };
if (!window.GAME_STATE) window.GAME_STATE = { WAIT: "WAIT", OPEN: "OPEN", END: "END" };
if (!window.STUDENT_STATE) window.STUDENT_STATE = { ONLINE: "ONLINE", OFFLINE: "OFFLINE", DONE: "DONE" };
if (!window.DEFAULT_CAPTCHA) window.DEFAULT_CAPTCHA = "자리확정";

/* =========================
   관리자 로그인
========================= */
document.getElementById("btn-admin-login").addEventListener("click", async () => {
  const pw = document.getElementById("admin-pw").value.trim();
  const error = document.getElementById("admin-login-error");
  error.innerText = "";

  // [치트키] 파이어베이스 에러 유무와 상관없이 '1234' 입력 시 무조건 통과
  if (pw === "4035" || pw === 4035) {
    document.getElementById("admin-login-view").classList.add("hidden");
    document.getElementById("admin-view").classList.remove("hidden");
    
    try { 
      initAdmin(); 
    } catch(e) { 
      alert("로그인은 되었으나 내부 데이터를 불러오는데 실패했습니다. 파이어베이스 연결을 확인하세요.");
      console.error(e); 
    }
    return;
  }

  // 일반 파이어베이스 로그인 로직
  try {
    if (typeof db === "undefined") {
      error.innerText = "데이터베이스(db) 연결에 실패했습니다. 1234를 입력해 보세요.";
      return;
    }

    const snap = await db.ref(`${window.PATH.GAME}/adminPassword`).once("value");
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
    error.innerText = "에러: " + err.message;
  }
});

/* =========================
   관리자 패널 활성화
========================= */
function initAdmin() {
  if (typeof db !== "undefined") {
    listenStudents();
    listenSeats();
    listenGame();
  }
  setupStudentManager();
}

/* =========================
   학생 계정 관리 및 1~29 자동 생성
========================= */
function setupStudentManager() {
  const btnGenerate = document.getElementById("btn-generate-students");
  if (!btnGenerate) return;
  
  btnGenerate.addEventListener("click", async () => {
    const defaultPwInput = document.getElementById("default-student-pw").value.trim();
    if (!defaultPwInput) {
      alert("학생용 초기 비밀번호를 입력하세요.");
      return;
    }

    const ok = confirm("1~29번 학생 계정을 자동 생성하시겠습니까?");
    if (!ok) return;

    const studentsData = {};
    for (let i = 1; i <= 29; i++) {
      studentsData[i] = {
        password: String(defaultPwInput),
        seat: null,
        status: window.STUDENT_STATE.OFFLINE
      };
    }

    try {
      await db.ref(`${window.PATH.STUDENTS}`).set(studentsData);
      alert("학생 계정이 일괄 생성되었습니다!");
    } catch (error) {
      alert("생성 실패: " + error.message);
    }
  });
}

/* =========================
   게임 상태 제어
========================= */
document.getElementById("btn-start").addEventListener("click", async () => {
  try {
    await db.ref(`${window.PATH.GAME}`).update({ state: window.GAME_STATE.OPEN });
    alert("티켓팅 시작!");
  } catch(e) { alert(e.message); }
});

document.getElementById("btn-end").addEventListener("click", async () => {
  try {
    await db.ref(`${window.PATH.GAME}`).update({ state: window.GAME_STATE.END });
    alert("티켓팅 종료!");
  } catch(e) { alert(e.message); }
});

document.getElementById("btn-reset").addEventListener("click", async () => {
  const ok = confirm("전체 초기화하시겠습니까?");
  if (!ok) return;

  try {
    await db.ref(`${window.PATH.GAME}`).update({ state: window.GAME_STATE.WAIT, captcha: window.DEFAULT_CAPTCHA });
    
    const studentSnap = await db.ref(`${window.PATH.STUDENTS}`).once("value");
    const currentStudents = studentSnap.val() || {};
    for (const id in currentStudents) {
      currentStudents[id].seat = null;
      currentStudents[id].status = window.STUDENT_STATE.OFFLINE;
    }
    await db.ref(`${window.PATH.STUDENTS}`).set(currentStudents);
    await db.ref(`${window.PATH.SEATS}`).set(generateInitialSeats());
    alert("초기화 완료!");
  } catch(e) { alert(e.message); }
});

/* =========================
   인증 단어 설정
========================= */
document.getElementById("btn-set-captcha").addEventListener("click", async () => {
  const value = document.getElementById("captcha-admin").value.trim();
  if (!value) return;

  try {
    await db.ref(`${window.PATH.GAME}`).update({ captcha: value });
    alert("변경 완료");
  } catch(e) { alert(e.message); }
});

/* =========================
   학생 목록 & 패널 리스트 실시간 연동
========================= */
function listenStudents() {
  db.ref(`${window.PATH.STUDENTS}`).on("value", (snap) => {
    const data = snap.val() || {};
    const listDisplay = document.getElementById("student-list");
    const listManage = document.getElementById("admin-student-list-manage");

    if (listDisplay) listDisplay.innerHTML = "";
    if (listManage) listManage.innerHTML = "";

    let onlineCount = 0;
    let totalCount = 0;

    for (const id in data) {
      totalCount++;
      if (data[id].status === window.STUDENT_STATE.ONLINE || data[id].status === window.STUDENT_STATE.DONE) onlineCount++;

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

/* =========================
   좌석 실시간 렌더링
========================= */
function listenSeats() {
  db.ref(`${window.PATH.SEATS}`).on("value", (snap) => {
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
          await db.ref(`${window.PATH.STUDENTS}/${seat.owner}`).update({ seat: null, status: window.STUDENT_STATE.ONLINE });
        }
        await db.ref(`${window.PATH.SEATS}/${id}`).update({ locked: !seat.locked, owner: null });
      });
      container.appendChild(div);
    }
  });
}

/* =========================
   게임 헤더 동기화
========================= */
function listenGame() {
  db.ref(`${window.PATH.GAME}`).on("value", (snap) => {
    const game = snap.val();
    if (!game) return;
    let status = game.state === window.GAME_STATE.OPEN ? "진행 중" : (game.state === window.GAME_STATE.END ? "종료됨" : "대기 중");
    const target = document.getElementById("captcha-status");
    if (target) target.innerText = `상태: [ ${status} ] / 단어: [ ${game.captcha || window.DEFAULT_CAPTCHA} ]`;
  });
}

function generateInitialSeats() {
  const seats = {};
  for (let i = 1; i <= 30; i++) {
    seats[`좌석${i}`] = { locked: false, owner: null };
  }
  return seats;
}
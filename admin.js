/* =========================
   전역 상태 및 상수 (안전장치 선언)
========================= */
const PATH = window.PATH || { STUDENTS: "students", GAME: "game", SEATS: "seats" };
const GAME_STATE = window.GAME_STATE || { WAIT: "WAIT", OPEN: "OPEN", END: "END" };
const STUDENT_STATE = window.STUDENT_STATE || { ONLINE: "ONLINE", OFFLINE: "OFFLINE", DONE: "DONE" };
const DEFAULT_CAPTCHA = "자리확정";

/* =========================
   관리자 로그인 (비밀번호 타입 버그 원천 차단)
========================= */
document.getElementById("btn-admin-login").addEventListener("click", async () => {
  const pw = document.getElementById("admin-pw").value.trim();
  const error = document.getElementById("admin-login-error");
  error.innerText = "";

  const snap = await db.ref(`${PATH.GAME}/adminPassword`).once("value");
  const realPw = snap.val();

  if (!realPw) {
    error.innerText = "관리자 비밀번호가 설정되지 않았습니다.";
    return;
  }

  // DB의 비밀번호가 숫자(1234)든 문자("1234")든 상관없이 매칭되도록 처리
  if (String(pw) !== String(realPw)) {
    error.innerText = "비밀번호가 틀렸습니다.";
    return;
  }

  document.getElementById("admin-login-view").classList.add("hidden");
  document.getElementById("admin-view").classList.remove("hidden");

  initAdmin();
});

/* =========================
   관리자 패널 활성화
========================= */
function initAdmin() {
  listenStudents();
  listenSeats();
  listenGame();
  setupStudentManager(); // 👈 학생 계정 관리 기능 연결
}

/* =========================
   ★ 학생 계정 관리 및 1~29 자동 생성 (핵심 추가)
========================= */
function setupStudentManager() {
  const btnGenerate = document.getElementById("btn-generate-students");
  
  btnGenerate.addEventListener("click", async () => {
    const defaultPwInput = document.getElementById("default-student-pw").value.trim();
    
    if (!defaultPwInput) {
      alert("학생들에게 부여할 공통 초기 비밀번호를 입력해 주세요! (예: 0000)");
      return;
    }

    const ok = confirm(`정말 모든 학생(1~29번)의 비밀번호를 '${defaultPwInput}'(으)로 세팅하여 자동 생성하시겠습니까?\n(기존 데이터는 덮어씌워집니다)`);
    if (!ok) return;

    const studentsData = {};
    for (let i = 1; i <= 29; i++) {
      studentsData[i] = {
        password: String(defaultPwInput), // 문자열로 통일하여 저장
        seat: null,
        status: STUDENT_STATE.OFFLINE
      };
    }

    try {
      await db.ref(`${PATH.STUDENTS}`).set(studentsData);
      alert("1번부터 29번까지 학생 계정이 일괄 생성 및 초기화되었습니다!");
    } catch (error) {
      console.error(error);
      alert("생성 중 오류가 발생했습니다. 파이어베이스 규칙을 확인하세요.");
    }
  });
}

/* =========================
   게임 상태 제어 (티켓팅 타이밍 제어)
========================= */
document.getElementById("btn-start").addEventListener("click", async () => {
  const snap = await db.ref(`${PATH.GAME}/captcha`).once("value");

  if (!snap.val()) {
    alert("인증 단어를 먼저 설정하세요.");
    return;
  }

  await db.ref(`${PATH.GAME}`).update({
    state: GAME_STATE.OPEN
  });

  alert("티켓팅이 실시간 시작되었습니다!");
});

document.getElementById("btn-end").addEventListener("click", async () => {
  await db.ref(`${PATH.GAME}`).update({
    state: GAME_STATE.END
  });

  alert("티켓팅이 종료되어 최종 결과 화면으로 락(Lock)되었습니다!");
});

document.getElementById("btn-reset").addEventListener("click", async () => {
  const ok = confirm("정말 모든 좌석판 배치를 초기화하시겠습니까? (학생 계정 데이터는 유지됩니다)");
  if (!ok) return;

  // 전체를 완전히 날리는 대신, 좌석 배정 정보 및 대기 상태만 깔끔하게 초기화
  await db.ref(`${PATH.GAME}`).update({
    state: GAME_STATE.WAIT,
    captcha: DEFAULT_CAPTCHA
  });

  // 모든 학생의 선택한 자리 및 상태 리셋 (계정/비번은 보존)
  const studentSnap = await db.ref(`${PATH.STUDENTS}`).once("value");
  const currentStudents = studentSnap.val() || {};
  for (const id in currentStudents) {
    currentStudents[id].seat = null;
    currentStudents[id].status = STUDENT_STATE.OFFLINE;
  }
  await db.ref(`${PATH.STUDENTS}`).set(currentStudents);

  // 좌석 원상복구 (1~29개의 기본 좌석 구조 생성)
  await db.ref(`${PATH.SEATS}`).set(generateInitialSeats());

  alert("좌석 배치 및 상태가 깨끗하게 초기화되었습니다!");
});

/* =========================
   인증 단어 설정
========================= */
document.getElementById("btn-set-captcha").addEventListener("click", async () => {
  const value = document.getElementById("captcha-admin").value.trim();

  if (!value) {
    alert("단어를 입력하세요.");
    return;
  }

  await db.ref(`${PATH.GAME}`).update({
    captcha: value
  });

  document.getElementById("captcha-status").innerText = `현재 단어: ${value}`;
  alert(`인증단어가 [ ${value} ] (으)로 변경되었습니다.`);
});

/* =========================
   학생 목록 & 패널 리스트 실시간 연동
========================= */
function listenStudents() {
  db.ref(`${PATH.STUDENTS}`).on("value", (snap) => {
    const data = snap.val() || {};
    const listDisplay = document.getElementById("student-list");
    const listManage = document.getElementById("admin-student-list-manage");

    listDisplay.innerHTML = "";
    if (listManage) listManage.innerHTML = "";

    let onlineCount = 0;
    let totalCount = 0;

    for (const id in data) {
      totalCount++;
      if (data[id].status === STUDENT_STATE.ONLINE || data[id].status === STUDENT_STATE.DONE) {
        onlineCount++;
      }

      // 1. 실시간 하단 접속 현황 리스트업
      const div = document.createElement("div");
      div.style.padding = "4px 0";
      let stateBadge = "🔴 OFFLINE";
      if (data[id].status === STUDENT_STATE.ONLINE) stateBadge = "🟢 ONLINE";
      if (data[id].status === STUDENT_STATE.DONE) stateBadge = "🔵 선택완료";

      div.innerText = `[${id}번] 상태: ${stateBadge} | 선택 좌석: ${data[id].seat || "-"}`;
      listDisplay.appendChild(div);

      // 2. 상단 학생 비밀번호 관리 리스트업
      if (listManage) {
        const manageDiv = document.createElement("div");
        manageDiv.style.borderBottom = "1px solid #eee";
        manageDiv.style.padding = "2px 0";
        manageDiv.innerText = `번호: ${id}번 | 설정 비밀번호: ${data[id].password}`;
        listManage.appendChild(manageDiv);
      }
    }

    document.getElementById("connect-count").innerText = `${onlineCount} / ${totalCount}`;
    if (totalCount === 0 && listManage) {
      listManage.innerText = "등록된 학생이 없습니다. 먼저 생성해 주세요.";
    }
  });
}

/* =========================
   ★ 좌석 실시간 렌더링 & 토글 잠금 (R1C1 제거 완벽 반영)
========================= */
function listenSeats() {
  db.ref(`${PATH.SEATS}`).on("value", (snap) => {
    const seats = snap.val() || {};
    const container = document.getElementById("admin-seat-grid");
    container.innerHTML = "";

    for (const id in seats) {
      const seat = seats[id];
      const div = document.createElement("div");
      div.className = "seat";

      // 스타일 클래스 주입
      if (seat.locked) div.classList.add("locked");
      if (seat.owner) div.classList.add("taken");

      // R1C1 텍스트 흔적 삭제 및 매칭 이름 표시 (임자가 있으면 학생 번호 노출)
      if (seat.locked) {
        div.innerText = "🔒";
      } else if (seat.owner) {
        div.innerText = `${id}\n(${seat.owner}번)`;
      } else {
        div.innerText = id; // 고유 좌석 식별 번호 노출
      }

      // 좌석 클릭 시 선생님 권한으로 실시간 잠금/해제 토글 활성화
      div.addEventListener("click", async () => {
        if (seat.owner) {
          const cancelOk = confirm(`이미 ${seat.owner}번 학생이 찜한 자리입니다. 강제로 취소/잠금 처리하시겠습니까?`);
          if (!cancelOk) return;
          
          // 학생의 데이터 초기화
          await db.ref(`${PATH.STUDENTS}/${seat.owner}`).update({ seat: null, status: STUDENT_STATE.ONLINE });
        }

        await db.ref(`${PATH.SEATS}/${id}`).update({
          locked: !seat.locked,
          owner: null // 잠금 시 기존 주인 데이터는 초기화
        });
      });

      container.appendChild(div);
    }
  });
}

/* =========================
   게임 상단 실시간 헤더 동기화
========================= */
function listenGame() {
  db.ref(`${PATH.GAME}`).on("value", (snap) => {
    const game = snap.val();
    if (!game) return;

    let status = "대기 중";
    if (game.state === GAME_STATE.OPEN) status = "진행 중";
    if (game.state === GAME_STATE.END) status = "종료됨";

    document.getElementById("captcha-status").innerText = `현재 상태: [ ${status} ] / 설정된 단어: [ ${game.captcha || DEFAULT_CAPTCHA} ]`;
  });
}

/* =========================
   기본 데이터셋 헬퍼 함수
========================= */
function generateInitialSeats() {
  const seats = {};
  // 교실 규모에 알맞게 1번 좌석부터 30번(혹은 교실 구조에 맞춰) 세팅 가능하도록 빌드
  for (let i = 1; i <= 30; i++) {
    seats[`좌석${i}`] = {
      locked: false,
      owner: null
    };
  }
  return seats;
}
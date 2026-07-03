/* =========================
   전역 상태 및 상수 (기존 파일 유지 대비)
========================= */
let myId = null;
let myData = null;
let currentGame = null;
let selectedSeat = null;

// 혹시 firebase.js나 상단에 선언이 안 되어 있을 경우를 대비한 안전장치 설정
const PATH = window.PATH || { STUDENTS: "students", GAME: "game", SEATS: "seats" };
const GAME_STATE = window.GAME_STATE || { WAIT: "WAIT", OPEN: "OPEN", END: "END" };
const STUDENT_STATE = window.STUDENT_STATE || { ONLINE: "ONLINE", OFFLINE: "OFFLINE", DONE: "DONE" };
const DEFAULT_CAPTCHA = "자리확정";

/* =========================
   화면 전환 및 요소 제어
========================= */
function showView(id) {
  document.querySelectorAll(".view").forEach(v => {
    v.classList.add("hidden");
  });
  document.getElementById(id).classList.remove("hidden");
}

/* =========================
   로그인 처리 (중복 코드 하나로 통합 및 개선)
========================= */
document.getElementById("btn-login").addEventListener("click", async () => {
  const id = document.getElementById("student-id").value.trim();
  const pw = document.getElementById("student-pw").value.trim();
  const error = document.getElementById("login-error");
  error.innerText = "";

  if (!id || !pw) {
    error.innerText = "번호와 비밀번호를 입력하세요.";
    return;
  }

  try {
    const snap = await db.ref(`${PATH.STUDENTS}/${id}`).once("value");
    const data = snap.val();

    if (!data) {
      error.innerText = "존재하지 않는 번호입니다.";
      return;
    }

    // 데이터베이스의 패스워드가 숫자형일 수도 있으므로 문자열 변환 후 비교
    if (String(data.password) !== String(pw)) {
      error.innerText = "비밀번호가 틀렸습니다.";
      return;
    }

    myId = id;
    myData = data;

    // 로컬 스토리지에 저장하여 새로고침 대응
    localStorage.setItem("myId", myId);

    // 로그인 상태 업데이트
    await db.ref(`${PATH.STUDENTS}/${id}`).update({
      status: STUDENT_STATE.ONLINE
    });

    // 실시간 감시 시작
    listenGameState();
    listenMyData();
    listenRealtimeSeats(); // 👈 실시간 좌석 리스너 작동

  } catch (err) {
    console.error("로그인 중 오류 발생:", err);
    error.innerText = "로그인 처리 중 에러가 발생했습니다.";
  }
});

/* =========================
   게임 상태 및 내 데이터 실시간 감시
========================= */
function listenGameState() {
  db.ref(`${PATH.GAME}`).on("value", (snap) => {
    currentGame = snap.val();
    if (!currentGame) return;

    // 1. 대기 상태 (WAIT)
    if (currentGame.state === GAME_STATE.WAIT) {
      showView("wait-view");
      document.getElementById("wait-id").innerText = myId;
    }

    // 2. 티켓팅 진행 상태 (OPEN)
    if (currentGame.state === GAME_STATE.OPEN) {
      if (myData && myData.seat) {
        // 이미 자리를 선택한 경우 -> 결과 화면을 보여주되 좌석판을 유지하도록 설계
        showResult(false);
      } else {
        showView("main-view");
      }
    }

    // 3. 종료 상태 (END) -> 자동 결과 화면 이동
    if (currentGame.state === GAME_STATE.END) {
      showResult(true);
    }
  });
}

function listenMyData() {
  db.ref(`${PATH.STUDENTS}/${myId}`).on("value", (snap) => {
    myData = snap.val();
    if (!myData) return;

    // 만약 진행 중 자리를 골랐다면 자동으로 화면을 전환하되 좌석 레이아웃을 다시 그림
    if (currentGame && currentGame.state === GAME_STATE.OPEN && myData.seat) {
      showResult(false);
    }
  });
}

/* =========================
   ★ 실시간 좌석 감시 및 반영 (핵심 수정)
========================= */
function listenRealtimeSeats() {
  // .once 대신 .on을 사용하여 다른 사람이 자리를 잡으면 실시간으로 화면이 다시 그려짐
  db.ref(`${PATH.SEATS}`).on("value", (snap) => {
    const seats = snap.val();
    
    // 현재 열려있는 화면(티켓팅 화면 or 결과 화면)에 맞추어 컨테이너 ID를 찾아 그림
    let container = document.getElementById("seat-container");
    
    // 선택 후 결과 화면으로 갔을 때도 하단에 좌석판이 유지되도록 동적 타겟팅
    if (document.getElementById("result-view").classList.contains("hidden") === false) {
      // 결과화면용 좌석판이 없으면 생성해서 붙여줌
      let resultGrid = document.getElementById("result-seat-grid");
      if (!resultGrid) {
        const resultViewCard = document.querySelector("#result-view .card");
        const title = document.createElement("h3");
        title.innerText = "📊 전체 좌석 현황 (실시간)";
        title.style.marginTop = "20px";
        
        // 칠판/창문 레이아웃 구조 복사 생성
        const classroom = document.createElement("div");
        classroom.className = "classroom-layout";
        classroom.innerHTML = `
          <div class="window-side">🟟 창문</div>
          <div id="result-seat-grid" class="seat-grid"></div>
          <div class="corridor-side">🚪 복도</div>
        `;
        
        // 칠판은 상단에 배치
        const bboard = document.createElement("div");
        bboard.className = "blackboard";
        bboard.innerText = "🖥️ 칠 판 (FRONT)";
        
        resultViewCard.appendChild(bboard);
        resultViewCard.appendChild(classroom);
        resultGrid = document.getElementById("result-seat-grid");
      }
      container = resultGrid;
    }

    if (!container) return;
    container.innerHTML = "";

    for (const seatId in seats) {
      const seat = seats[seatId];
      const div = document.createElement("div");
      div.className = "seat";

      // 1. 잠금 좌석 조건 처리
      if (seat.locked) {
        div.classList.add("locked");
        div.innerText = "🔒";
      } 
      // 2. 이미 주인이 있는 좌석 처리
      else if (seat.owner) {
        if (String(seat.owner) === String(myId)) {
          div.classList.add("my-seat"); // 👈 내 자리는 파란색 (CSS에서 .my-seat 세팅 필요)
          div.innerText = `${seatId}\n(내자리)`;
        } else {
          div.classList.add("taken");   // 👈 남의 자리는 회색
          div.innerText = `${seat.owner}번`; // 선택한 학생의 번호 출력
        }
      } 
      // 3. 빈 좌석 처리 (R1C1 문구 제거하고 고유 DB 키값만 노출)
      else {
        div.innerText = seatId;
        
        // 내가 아직 자리를 고르지 않은 상태이고, 진행 중일 때만 클릭 활성화
        if (currentGame && currentGame.state === GAME_STATE.OPEN && !(myData && myData.seat)) {
          div.addEventListener("click", () => {
            openModal(seatId);
          });
        }
      }

      container.appendChild(div);
    }
  });
}

/* =========================
   결과 화면 표시 (개선)
========================= */
function showResult(final = false) {
  showView("result-view");
  const box = document.getElementById("final-seat");

  if (myData && myData.seat) {
    box.innerHTML = `
      <h3>🎉 내 번호: ${myId}번</h3>
      <p style="font-size: 1.2rem; font-weight: bold; color: #007bff;">선택된 좌석: [ ${myData.seat} ]</p>
    `;
  } else {
    box.innerHTML = `<p>아직 좌석을 선택하지 못했습니다.</p>`;
  }

  if (final) {
    document.querySelector("#result-view h2").innerText = "🏁 최종 결과 화면";
  }
}

/* =========================
   인증 모달 제어
========================= */
function openModal(seatId) {
  selectedSeat = seatId;
  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("captcha-input").value = "";

  db.ref(`${PATH.GAME}/captcha`).once("value", (snap) => {
    document.getElementById("captcha-text").innerText = snap.val() || DEFAULT_CAPTCHA;
  });
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  document.getElementById("captcha-input").value = "";
  selectedSeat = null;
}

document.getElementById("btn-cancel").addEventListener("click", closeModal);

/* =========================
   ★ 좌석 확정 및 중복 버그 원천 차단 (Transaction 적용)
========================= */
document.getElementById("btn-confirm").addEventListener("click", async () => {
  const input = document.getElementById("captcha-input").value.trim();

  const snap = await db.ref(`${PATH.GAME}/captcha`).once("value");
  const real = snap.val();

  if (input !== real) {
    alert("인증 단어가 틀렸습니다.");
    return;
  }

  if (!selectedSeat) return;

  const seatRef = db.ref(`${PATH.SEATS}/${selectedSeat}`);

  // Firebase 트랜잭션을 사용하여 밀리초 단위로 동시에 누른 유저의 충돌을 완벽 방어합니다.
  seatRef.transaction((currentData) => {
    if (currentData === null) return currentData;
    
    // 만약 서버상에 이미 주인이 있다면 트랜잭션을 취소(abort)시킵니다.
    if (currentData.owner) {
      return; 
    }
    
    // 주인이 없다면 내 ID를 선점시킵니다.
    currentData.owner = myId;
    return currentData;
  }, async (error, committed, snapshot) => {
    if (error) {
      alert("오류가 발생했습니다. 다시 시도해 주세요.");
    } else if (!committed) {
      // committed가 false면 이미 다른 사람이 먼저 선점하여 튕겨 나온 상황입니다.
      alert("앗! 간발의 차이로 이미 다른 학생이 선택한 좌석입니다.");
      closeModal();
    } else {
      // 득점 성공! 내 정보에 좌석을 업데이트 합니다.
      await db.ref(`${PATH.STUDENTS}/${myId}`).update({
        seat: selectedSeat,
        status: STUDENT_STATE.DONE
      });
      closeModal();
      showResult(false);
    }
  });
});

/* =========================
   자동 재접속 / 새로고침 처리
========================= */
window.addEventListener("load", async () => {
  const savedId = localStorage.getItem("myId");

  if (savedId) {
    myId = savedId;
    const snap = await db.ref(`${PATH.STUDENTS}/${myId}`).once("value");
    myData = snap.val();

    if (myData) {
      listenGameState();
      listenMyData();
      listenRealtimeSeats();
    } else {
      localStorage.removeItem("myId");
    }
  }
});

/* =========================
   ESC 단축키 처리
========================= */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
  }
});

/* =========================
   전역 상태
========================= */

let myId = null;
let myData = null;
let currentGame = null;
let selectedSeat = null;


/* =========================
   화면 전환
========================= */

function showView(id) {
  document.querySelectorAll(".view").forEach(v => {
    v.classList.add("hidden");
  });
  document.getElementById(id).classList.remove("hidden");
}


/* =========================
   로그인 처리
========================= */

document.getElementById("btn-login").addEventListener("click", async () => {
  const id = document.getElementById("student-id").value;
  const pw = document.getElementById("student-pw").value;

  const error = document.getElementById("login-error");
  error.innerText = "";

  if (!id || !pw) {
    error.innerText = "번호와 비밀번호를 입력하세요.";
    return;
  }

  const snap = await db.ref(`${PATH.STUDENTS}/${id}`).once("value");
  const data = snap.val();

  if (!data) {
    error.innerText = "존재하지 않는 번호입니다.";
    return;
  }

  if (data.password !== pw) {
    error.innerText = "비밀번호가 틀렸습니다.";
    return;
  }

  myId = id;
  myData = data;

  // 로그인 기록 업데이트
  db.ref(`${PATH.STUDENTS}/${id}`).update({
    status: STUDENT_STATE.ONLINE
  });

  listenGameState();
  listenMyData();

});


/* =========================
   게임 상태 감시
========================= */

function listenGameState() {
  db.ref(`${PATH.GAME}`).on("value", (snap) => {
    currentGame = snap.val();

    if (!currentGame) return;

    // WAIT
    if (currentGame.state === GAME_STATE.WAIT) {
      showView("wait-view");
      document.getElementById("wait-id").innerText = myId;
    }

    // OPEN
    if (currentGame.state === GAME_STATE.OPEN) {
      if (myData?.seat) {
        showResult();
      } else {
        showView("main-view");
        renderSeats();
      }
    }

    // END
    if (currentGame.state === GAME_STATE.END) {
      showResult(true);
    }
  });
}


/* =========================
   내 데이터 감시
========================= */

function listenMyData() {
  db.ref(`${PATH.STUDENTS}/${myId}`).on("value", (snap) => {
    myData = snap.val();

    if (!myData) return;

    if (myData.seat) {
      document.getElementById("final-seat").innerText =
        `내 자리: ${myData.seat}`;
    }
  });
}


/* =========================
   결과 화면
========================= */

function showResult(final = false) {
  showView("result-view");

  if (final) {
    document.querySelector("#result-view h2").innerText = "🎉 최종 결과";
  }
}

/* =========================
   좌석 렌더링
========================= */

function renderSeats() {
  const container = document.getElementById("seat-container");
  container.innerHTML = "";

  db.ref(`${PATH.SEATS}`).once("value", (snap) => {
    const seats = snap.val();

    for (const seatId in seats) {
      const seat = seats[seatId];

      const div = document.createElement("div");
      div.className = "seat";

      // 상태 표시
      if (seat.locked) {
        div.classList.add("locked");
      }

      if (seat.owner) {
        div.classList.add("taken");
        div.innerText = seat.owner;
      } else {
        div.innerText = seatId;
      }

      // 클릭 이벤트
      if (!seat.owner && !seat.locked) {
        div.addEventListener("click", () => {
          openModal(seatId);
        });
      }

      container.appendChild(div);
    }
  });
}


/* =========================
   좌석 클릭 → 모달 열기
========================= */

function openModal(seatId) {
  selectedSeat = seatId;

  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("captcha-input").value = "";

  // 인증 단어 불러오기
  db.ref(`${PATH.GAME}/captcha`).once("value", (snap) => {
    document.getElementById("captcha-text").innerText =
      snap.val() || DEFAULT_CAPTCHA;
  });
}


/* =========================
   모달 닫기
========================= */

document.getElementById("btn-cancel").addEventListener("click", () => {
  document.getElementById("modal").classList.add("hidden");
  selectedSeat = null;
});


/* =========================
   좌석 확정
========================= */

document.getElementById("btn-confirm").addEventListener("click", async () => {
  const input = document.getElementById("captcha-input").value;

  const snap = await db.ref(`${PATH.GAME}/captcha`).once("value");
  const real = snap.val();

  if (input !== real) {
    alert("인증 단어가 틀렸습니다.");
    return;
  }

  // 좌석 확정
  const seatRef = db.ref(`${PATH.SEATS}/${selectedSeat}`);

  const seatSnap = await seatRef.once("value");
  const seatData = seatSnap.val();

  if (seatData.owner) {
    alert("이미 선택된 자리입니다.");
    return;
  }

  await seatRef.update({
    owner: myId
  });

  await db.ref(`${PATH.STUDENTS}/${myId}`).update({
    seat: selectedSeat,
    status: STUDENT_STATE.DONE
  });

  document.getElementById("modal").classList.add("hidden");

  showResult(false);
});

/* =========================
   자동 재접속 / 초기 상태 복구
========================= */

window.addEventListener("load", async () => {

  // 이미 로그인된 상태인지 체크 (새로고침 대응)
  // localStorage 사용
  const savedId = localStorage.getItem("myId");

  if (savedId) {
    myId = savedId;

    const snap = await db.ref(`${PATH.STUDENTS}/${myId}`).once("value");
    myData = snap.val();

    if (myData) {
      listenGameState();
      listenMyData();
    }
  }
});


/* =========================
   로그인 후 저장
========================= */

document.getElementById("btn-login").addEventListener("click", async () => {

  const id = document.getElementById("student-id").value;
  const pw = document.getElementById("student-pw").value;

  const error = document.getElementById("login-error");
  error.innerText = "";

  if (!id || !pw) {
    error.innerText = "번호와 비밀번호를 입력하세요.";
    return;
  }

  const snap = await db.ref(`${PATH.STUDENTS}/${id}`).once("value");
  const data = snap.val();

  if (!data) {
    error.innerText = "존재하지 않는 번호입니다.";
    return;
  }

  if (data.password !== pw) {
    error.innerText = "비밀번호가 틀렸습니다.";
    return;
  }

  myId = id;
  myData = data;

  // 저장 (새로고침 대응)
  localStorage.setItem("myId", myId);

  await db.ref(`${PATH.STUDENTS}/${id}`).update({
    status: STUDENT_STATE.ONLINE
  });

  listenGameState();
  listenMyData();
});


/* =========================
   결과 표시 개선
========================= */

function showResult(final = false) {
  showView("result-view");

  const box = document.getElementById("final-seat");

  if (myData?.seat) {
    box.innerHTML = `
      <h3>내 번호: ${myId}</h3>
      <p>선택 좌석: ${myData.seat}</p>
    `;
  } else {
    box.innerHTML = `<p>아직 좌석을 선택하지 않았습니다.</p>`;
  }

  if (final) {
    document.querySelector("#result-view h2").innerText = "🎉 최종 결과";
  }
}


/* =========================
   초기화 대응 (관리자가 reset 했을 때)
========================= */

db.ref(`${PATH.GAME}`).on("value", (snap) => {
  const game = snap.val();

  if (!game) return;

  if (game.state === GAME_STATE.WAIT) {

    // reset 시 로그인 유지 + 화면 초기화
    if (myId) {
      showView("wait-view");
      document.getElementById("wait-id").innerText = myId;
    }

    // 선택 상태 초기화 감지
    if (myData && !myData.seat) {
      renderSeats();
    }
  }
});


/* =========================
   UX 보정 (모달 초기화)
========================= */

function resetModal() {
  document.getElementById("captcha-input").value = "";
  selectedSeat = null;
}


/* =========================
   ESC로 모달 닫기
========================= */

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.getElementById("modal").classList.add("hidden");
    resetModal();
  }
});
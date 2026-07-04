/* =========================
   전역 상태
========================= */
let myId = null;
let myData = null;
let currentGame = null;
let selectedSeat = null;

/* =========================
   실시간 접속 감지 (presence)
   - 연결이 끊기는 순간(탭 닫힘, 네트워크 끊김 등) Firebase가 자동으로 OFFLINE 처리
========================= */
function setupPresence() {
    const connectedRef = db.ref(".info/connected");
    connectedRef.on("value", (snap) => {
        if (snap.val() === true && myId) {
            const myRef = db.ref(`${PATH.STUDENTS}/${myId}`);
            // 연결이 끊기면 자동으로 OFFLINE으로 바뀌도록 서버에 예약
            myRef.onDisconnect().update({ status: STUDENT_STATE.OFFLINE });
            // 지금은 연결되어 있으니 ONLINE으로 표시
            myRef.update({ status: STUDENT_STATE.ONLINE });
        }
    });
}

/* =========================
   화면 전환
========================= */
function showView(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");
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
    localStorage.setItem("myId", myId);

    await db.ref(`${PATH.STUDENTS}/${id}`).update({
        status: STUDENT_STATE.ONLINE,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });

    initListeners();
    setupPresence();
});

/* =========================
   로그아웃 처리 (같은 태블릿을 여러 학생이 사용하는 경우 대비)
========================= */
async function logout() {
    if (myId) {
        await db.ref(`${PATH.STUDENTS}/${myId}`).update({
            status: STUDENT_STATE.OFFLINE
        });
    }
    localStorage.removeItem("myId");
    location.reload();
}

document.getElementById("btn-logout-wait")?.addEventListener("click", logout);
document.getElementById("btn-logout-result")?.addEventListener("click", logout);

/* =========================
   리스너 통합
========================= */
function initListeners() {
    // 1. 게임 상태 감시
    db.ref(`${PATH.GAME}`).on("value", (snap) => {
        currentGame = snap.val();
        if (!currentGame) return;

        if (currentGame.state === GAME_STATE.WAIT) {
            showView("wait-view");
            document.getElementById("wait-id").innerText = myId;
            // 초기화 등으로 상태가 WAIT으로 바뀌어도, 이 리스너가 실행되고 있다는 것 자체가
            // 접속 중이라는 뜻이므로 새로고침 없이 ONLINE으로 다시 표시
            db.ref(`${PATH.STUDENTS}/${myId}`).update({ status: STUDENT_STATE.ONLINE });
        } else if (currentGame.state === GAME_STATE.OPEN) {
            if (myData?.seat) {
                showResult(false);
            } else {
                showView("main-view");
            }
        } else if (currentGame.state === GAME_STATE.END) {
            document.getElementById("modal").classList.add("hidden");
            showResult(true);
        }
    });

    // 2. 좌석 실시간 감시 (선택 화면 — 다른 사람 좌석은 "마감"으로만 표시)
    db.ref(`${PATH.SEATS}`).on("value", (snap) => {
        const seats = snap.val() || {};
        renderSeatGrid(document.getElementById("seat-container"), seats, {
            interactive: true,
            revealOwner: false
        });
    });

    // 3. 내 데이터 감시
    db.ref(`${PATH.STUDENTS}/${myId}`).on("value", (snap) => {
        myData = snap.val();

        if (myData?.seat) {
            const mainView = document.getElementById("main-view");
            if (!mainView.classList.contains("hidden")) {
                showResult(false);
            }
        }
    });
}

/* =========================
   좌석 그리드 렌더링 (학생 선택 화면 / 최종 결과 화면 공용)
   - interactive: 빈 좌석 클릭 가능 여부
   - revealOwner: 다른 사람 좌석에 번호를 보여줄지 여부 (최종 결과에서만 true)
========================= */
function renderSeatGrid(container, seats, { interactive = false, revealOwner = false } = {}) {
    container.innerHTML = "";

    for (const seatId in seats) {
        const seat = seats[seatId];
        const div = document.createElement("div");
        div.className = "seat";

        if (seat.locked) {
            div.classList.add("locked");
        } else if (seat.owner) {
            div.classList.add("taken");
            if (seat.owner === myId) {
                div.innerText = seat.owner;
                div.classList.add("my-seat");
            } else {
                div.innerText = revealOwner ? seat.owner : "마감";
                div.classList.add("other-taken");
            }
        } else if (interactive) {
            div.onclick = () => openModal(seatId);
        }

        container.appendChild(div);

        // 2열마다 통로(빈 칸)를 넣어 분단 구분 (R{행}C{열} 형식에서 열 번호 추출)
        const col = parseInt(seatId.split("C")[1], 10);
        if (col === 2 || col === 4) {
            const spacer = document.createElement("div");
            spacer.className = "seat-spacer";
            container.appendChild(spacer);
        }
    }
}

/* =========================
   결과 화면
========================= */
function showResult(final = false) {
    showView("result-view");
    const box = document.getElementById("final-seat");
    const waitingText = document.getElementById("result-waiting-text");

    if (final) {
        document.querySelector("#result-view h2").innerText = "🎉 최종 결과";
        waitingText.classList.add("hidden");

        db.ref(`${PATH.SEATS}`).once("value", (snap) => {
            const seats = snap.val() || {};
            const wrapper = document.createElement("div");
            wrapper.className = "seat-grid";
            box.innerHTML = "";
            box.appendChild(wrapper);
            renderSeatGrid(wrapper, seats, { interactive: false, revealOwner: true });
        });
    } else {
        document.querySelector("#result-view h2").innerText = "자리 배치 결과";
        waitingText.classList.remove("hidden");
        box.innerHTML = myData?.seat
            ? `<h3>내 번호: ${myId}</h3><p>선택 좌석 확정!</p>`
            : `<p>결과를 기다리는 중입니다...</p>`;
    }
}

/* =========================
   좌석 클릭 처리
========================= */
function openModal(seatId) {
    if (myData && myData.seat) {
        alert("이미 좌석을 선택하셨습니다.");
        return;
    }

    selectedSeat = seatId;
    document.getElementById("modal").classList.remove("hidden");
    document.getElementById("captcha-input").value = "";

    db.ref(`${PATH.GAME}/captcha`).once("value", (snap) => {
        document.getElementById("captcha-text").innerText = snap.val() || "확인";
    });
}

document.getElementById("btn-cancel").addEventListener("click", () => {
    document.getElementById("modal").classList.add("hidden");
    selectedSeat = null;
});

document.getElementById("btn-confirm").addEventListener("click", async () => {
    // 1. 이미 자리를 잡았는지 재확인
    const currentSnap = await db.ref(`${PATH.STUDENTS}/${myId}`).once("value");
    const currentData = currentSnap.val();
    if (currentData && currentData.seat) {
        alert("이미 좌석을 선택하셨습니다.");
        document.getElementById("modal").classList.add("hidden");
        return;
    }

    // 2. 인증 단어 확인
    const input = document.getElementById("captcha-input").value;
    const captchaSnap = await db.ref(`${PATH.GAME}/captcha`).once("value");
    if (input !== captchaSnap.val()) {
        alert("인증 단어가 틀렸습니다.");
        return;
    }

    // 3. 트랜잭션으로 좌석 확정 → 동시에 여러 명이 눌러도 딱 한 명만 성공
    const seatRef = db.ref(`${PATH.SEATS}/${selectedSeat}`);
    const result = await seatRef.transaction((seat) => {
        if (!seat) return seat;              // 데이터 없음 → 중단
        if (seat.owner || seat.locked) {
            return;                          // 이미 주인이 있거나 잠긴 자리 → 트랜잭션 중단
        }
        seat.owner = myId;
        return seat;
    });

    if (!result.committed || result.snapshot.val()?.owner !== myId) {
        alert("이미 선택된 자리입니다. 다른 자리를 선택해주세요.");
        document.getElementById("modal").classList.add("hidden");
        return;
    }

    // 4. 학생 데이터 갱신
    await db.ref(`${PATH.STUDENTS}/${myId}`).update({
        seat: selectedSeat,
        status: STUDENT_STATE.DONE
    });

    document.getElementById("modal").classList.add("hidden");
});

/* =========================
   자동 로그인 (새로고침 대응)
========================= */
window.addEventListener("load", async () => {
    const savedId = localStorage.getItem("myId");
    if (savedId) {
        myId = savedId;
        const snap = await db.ref(`${PATH.STUDENTS}/${myId}`).once("value");
        myData = snap.val();
        if (myData) {
            await db.ref(`${PATH.STUDENTS}/${myId}`).update({
                status: STUDENT_STATE.ONLINE
            });
            initListeners();
            setupPresence();
        }
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        document.getElementById("modal").classList.add("hidden");
    }
});

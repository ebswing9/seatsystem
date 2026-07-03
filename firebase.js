const firebaseConfig = {
  apiKey: "process.env.FIREBASE_API_KEY",
  authDomain: "classseat-70199.firebaseapp.com",
  databaseURL: "https://classseat-70199-default-rtdb.firebaseio.com",
  projectId: "classseat-70199",
  storageBucket: "classseat-70199.firebasestorage.app",
  messagingSenderId: "70208434015",
  appId: "1:70208434015:web:9557a0acdb1c4f2de5d0ea"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const db = firebase.database();


// ==========================
// 🔥 공통 경로
// ==========================
const PATH = {
  GAME: "game",
  STUDENTS: "students",
  SEATS: "seats"
};


// ==========================
// 🎮 게임 상태
// ==========================
const GAME_STATE = {
  WAIT: "WAIT",
  OPEN: "OPEN",
  END: "END"
};


// ==========================
// 🧑 학생 상태
// ==========================
const STUDENT_STATE = {
  OFFLINE: "OFFLINE",
  ONLINE: "ONLINE",
  DONE: "DONE"
};


// ==========================
// 🔐 인증 단어 기본값
// ==========================
const DEFAULT_CAPTCHA = "자리확정";


// ==========================
// 🪑 좌석 생성 함수
// ==========================
function generateSeats() {
  const seats = {};
  let count = 1;

  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 6; c++) {

      // 마지막 칸 제외 (29석)
      if (r === 5 && c === 6) continue;

      const id = `R${r}C${c}`;

      seats[id] = {
        owner: null,
        locked: false
      };

      count++;
    }
  }

  return seats;
}


// ==========================
// 🔐 인증 단어 검증
// ==========================
function checkCaptcha(input, real) {
  return input.trim() === real;
}


// ==========================
// ⏱ sleep (UI용)
// ==========================
function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}


// ==========================
// 🧠 상태 기본 초기화 구조
// ==========================
function getInitialGame() {
  return {
    state: GAME_STATE.WAIT,
    captcha: DEFAULT_CAPTCHA
  };
}

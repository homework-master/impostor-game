// Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAB-n2VgC8cFwS2_0XXbDXohDR1tbJmn1c",
  authDomain: "impostor-game-e2bec.firebaseapp.com",
  projectId: "impostor-game-e2bec",
  storageBucket: "impostor-game-e2bec.firebasestorage.app",
  messagingSenderId: "91990939868",
  appId: "1:91990939868:web:8d7ef85ada985594063c19",
  measurementId: "G-NQ7F2HX43B"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const wordBank = {
  Animals: [
    { word: "Elephant", hint: "Big ears" },
    { word: "Tiger", hint: "Stripes" },
    { word: "Kangaroo", hint: "Pouch" },
  ],
  Fruits: [
    { word: "Apple", hint: "Keeps doctor away" },
    { word: "Banana", hint: "Yellow peel" },
    { word: "Cherry", hint: "Small and red" },
  ],
  Colors: [
    { word: "Blue", hint: "Sky" },
    { word: "Red", hint: "Stop sign" },
    { word: "Green", hint: "Grass" },
  ],
};

let playerId = null;
let playerName = null;
let roomCode = null;
let roomRef = null;

const loginScreen = document.getElementById("loginScreen");
const lobbyScreen = document.getElementById("lobbyScreen");
const turnScreen = document.getElementById("turnScreen");
const postRoundScreen = document.getElementById("postRoundScreen");
const votingScreen = document.getElementById("votingScreen");
const resultsScreen = document.getElementById("resultsScreen");

const usernameInput = document.getElementById("usernameInput");
const roomCodeInput = document.getElementById("roomCodeInput");
const roomPasswordInput = document.getElementById("roomPasswordInput");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const createRoomBtn = document.getElementById("createRoomBtn");
const loginMessage = document.getElementById("loginMessage");

const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const playersList = document.getElementById("playersList");
const startGameBtn = document.getElementById("startGameBtn");

const roundNumberDisplay = document.getElementById("roundNumber");
const categoryDisplay = document.getElementById("categoryDisplay");
const turnIndicator = document.getElementById("turnIndicator");
const hintDisplay = document.getElementById("hintDisplay");
const shownWordDiv = document.getElementById("shownWord");
const wordInputSection = document.getElementById("wordInputSection");
const wordInput = document.getElementById("wordInput");
const submitWordBtn = document.getElementById("submitWordBtn");

const voteContinueBtn = document.getElementById("voteContinueBtn");
const voteNowBtn = document.getElementById("voteNowBtn");
const voteStatus = document.getElementById("voteStatus");

const votingListUl = document.getElementById("votingList");
const votingMsg = document.getElementById("votingMsg");

const resultsMessage = document.getElementById("resultsMessage");
const rematchBtn = document.getElementById("rematchBtn");

function show(screen) {
  [loginScreen, lobbyScreen, turnScreen, postRoundScreen, votingScreen, resultsScreen].forEach(
    (s) => s.classList.add("hidden")
  );
  screen.classList.remove("hidden");
}

// Generate random ID
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// Hash password with SHA-256
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// -------- JOIN ROOM --------
async function joinRoom() {
  playerName = usernameInput.value.trim();
  roomCode = roomCodeInput.value.trim().toUpperCase();
  const password = roomPasswordInput.value;

  if (!playerName || !roomCode || !password) {
    loginMessage.textContent = "Fill all fields";
    return;
  }
  loginMessage.textContent = "";

  roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    loginMessage.textContent = "Room does not exist";
    return;
  }

  const room = roomSnap.data();
  const pwHash = await hashPassword(password);
  if (pwHash !== room.passwordHash) {
    loginMessage.textContent = "Incorrect password";
    return;
  }

  playerId = generateId();
  const players = room.players || [];

  // Check name taken
  if (players.find((p) => p.name === playerName)) {
    loginMessage.textContent = "Name already taken";
    return;
  }

  players.push({ id: playerId, name: playerName });
  await roomRef.update({ players });

  listenToRoom();

  show(lobbyScreen);
}

// -------- CREATE ROOM --------
async function createRoom() {
  playerName = usernameInput.value.trim();
  roomCode = roomCodeInput.value.trim().toUpperCase();
  const password = roomPasswordInput.value;

  if (!playerName || !roomCode || !password) {
    loginMessage.textContent = "Fill all fields";
    return;
  }
  loginMessage.textContent = "";

  roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  if (roomSnap.exists) {
    loginMessage.textContent = "Room code already exists";
    return;
  }

  playerId = generateId();
  const pwHash = await hashPassword(password);

  await roomRef.set({
    passwordHash: pwHash,
    players: [{ id: playerId, name: playerName }],
    hostId: playerId,
    state: "lobby",
  });

  listenToRoom();

  show(lobbyScreen);
}

// -------- LISTEN TO ROOM CHANGES --------
function listenToRoom() {
  roomRef.onSnapshot((doc) => {
    const room = doc.data();
    if (!room) {
      alert("Room deleted");
      location.reload();
      return;
    }

    updateUI(room);
    hostGameLogic(room);
  });
}

// -------- UPDATE UI --------
function updateUI(room) {
  roomCodeDisplay.textContent = roomRef.id;

  // Update players list
  playersList.innerHTML = "";
  room.players.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p.name;
    if (p.id === room.hostId) li.classList.add("host");
    playersList.appendChild(li);
  });

  // Show start game button only to host if enough players
  if (playerId === room.hostId && room.state === "lobby" && room.players.length >= 3) {
    startGameBtn.classList.remove("hidden");
  } else {
    startGameBtn.classList.add("hidden");
  }

  switch (room.state) {
    case "lobby":
      show(lobbyScreen);
      break;

    case "turn":
      show(turnScreen);
      updateTurnUI(room);
      break;

    case "roundEnd":
      show(postRoundScreen);
      updatePostRoundUI(room);
      break;

    case "voting":
      show(votingScreen);
      updateVotingUI(room);
      break;

    case "results":
      show(resultsScreen);
      updateResultsUI(room);
      break;

    default:
      show(lobbyScreen);
  }
}

// -------- UPDATE TURN UI --------
function updateTurnUI(room) {
  roundNumberDisplay.textContent = room.roundNumber || 1;
  categoryDisplay.textContent = `Category: ${room.category || ""}`;

  const currentPlayer = room.players[room.currentTurnIndex];
  turnIndicator.textContent = `Current turn: ${currentPlayer ? currentPlayer.name : ""}`;

  // Show hint only to impostor
  if (playerId === room.impostorId) {
    hintDisplay.textContent = `Hint: ${room.impostorHint}`;
  } else {
    hintDisplay.textContent = "";
  }

  // Show secret word only to crewmates and only if no word is currently shown
  if (room.currentWord) {
    shownWordDiv.textContent = room.currentWord;
    shownWordDiv.classList.remove("hidden");
    wordInputSection.classList.add("hidden");
  } else {
    shownWordDiv.textContent = playerId === room.impostorId ? room.impostorHint : room.secretWord || "";
    shownWordDiv.classList.remove("hidden");
    // Show input only if it's your turn and no word submitted yet
    if (currentPlayer && currentPlayer.id === playerId) {
      wordInputSection.classList.remove("hidden");
      wordInput.value = "";
      wordInput.focus();
      submitWordBtn.disabled = false;
    } else {
      wordInputSection.classList.add("hidden");
    }
  }
}

// -------- SUBMIT WORD --------
async function submitWord() {
  const word = wordInput.value.trim();
  if (!word) return;

  const roomSnap = await roomRef.get();
  const room = roomSnap.data();
  if (!room) return;

  const currentPlayer = room.players[room.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return;

  // Disable submit button to prevent double submits
  submitWordBtn.disabled = true;

  // Update currentWord so everyone sees it briefly
  await roomRef.update({
    currentWord: word,
  });

  if (playerId === room.hostId) {
    setTimeout(async () => {
      // Advance turn and clear currentWord
      const freshSnap = await roomRef.get();
      const freshRoom = freshSnap.data();
      if (!freshRoom) return;

      let nextIndex = freshRoom.currentTurnIndex + 1;

      if (nextIndex >= freshRoom.players.length) {
        // Round finished, prompt continue/vote
        await roomRef.update({
          state: "roundEnd",
          currentTurnIndex: 0,
          currentWord: null,
          phase: "postRound",
          votesContinue: {},
          votesVote: {},
        });
      } else {
        // Next turn
        await roomRef.update({
          currentTurnIndex: nextIndex,
          currentWord: null,
          phase: "turn",
        });
      }
    }, 3000); // Show word for 3 seconds
  }
}

// -------- UPDATE POST ROUND UI --------
function updatePostRoundUI(room) {
  voteStatus.textContent = `Votes Continue: ${Object.keys(room.votesContinue || {}).length} | Votes Vote: ${Object.keys(room.votesVote || {}).length}`;
  // Disable buttons if player already voted
  voteContinueBtn.disabled = !!room.votesContinue?.[playerId] || !!room.votesVote?.[playerId];
  voteNowBtn.disabled = voteContinueBtn.disabled;
}

// -------- VOTE CONTINUE --------
async function voteContinue() {
  const update = {};
  update[`votesContinue.${playerId}`] = true;
  await roomRef.update(update);
}

// -------- VOTE NOW --------
async function voteNow() {
  const update = {};
  update[`votesVote.${playerId}`] = true;
  await roomRef.update(update);
}

// -------- UPDATE VOTING UI --------
function updateVotingUI(room) {
  votingListUl.innerHTML = "";
  votingMsg.textContent = "";

  room.players.forEach((p) => {
    if (p.id === playerId) return; // can't vote self
    const li = document.createElement("li");
    li.textContent = p.name;
    li.onclick = () => voteForPlayer(p.id);
    votingListUl.appendChild(li);
  });

  if (room.finalVotes?.[playerId]) {
    votingMsg.textContent = "You have voted";
  } else {
    votingMsg.textContent = "Click a player to vote them out";
  }
}

// -------- VOTE FOR PLAYER --------
async function voteForPlayer(votedId) {
  const roomSnap = await roomRef.get();
  const room = roomSnap.data();
  if (!room) return;
  if (room.finalVotes?.[playerId]) return; // already voted

  const update = {};
  update[`finalVotes.${playerId}`] = votedId;
  await roomRef.update(update);
}

// -------- UPDATE RESULTS UI --------
function updateResultsUI(room) {
  resultsMessage.textContent = room.resultsMessage || "";

  if (playerId === room.hostId) {
    rematchBtn.classList.remove("hidden");
  } else {
    rematchBtn.classList.add("hidden");
  }
}

// -------- REMATCH --------
async function rematch() {
  if (playerId !== (await (await roomRef.get()).data()).hostId) {
    alert("Only host can start rematch");
    return;
  }

  const categories = Object.keys(wordBank);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const { word: secretWord, hint: impostorHint } = wordBank[category][
    Math.floor(Math.random() * wordBank[category].length)
  ];

  const roomSnap = await roomRef.get();
  const room = roomSnap.data();
  if (!room) return;

  const players = room.players;
  if (!players || players.length < 3) {
    alert("Need at least 3 players for rematch");
    return;
  }

  // Pick impostor randomly
  const impostor = players[Math.floor(Math.random() * players.length)];

  await roomRef.update({
    state: "turn",
    category,
    secretWord,
    impostorHint,
    impostorId: impostor.id,
    currentTurnIndex: 0,
    currentWord: null,
    roundNumber: 1,
    phase: "turn",
    votesContinue: {},
    votesVote: {},
    finalVotes: {},
    resultsMessage: null,
  });
}

// -------- HOST GAME LOGIC --------
async function hostGameLogic(room) {
  if (playerId !== room.hostId) return;
  const total = room.players.length;

  if (room.state === "roundEnd") {
    const contCount = Object.keys(room.votesContinue || {}).length;
    const voteCount = Object.keys(room.votesVote || {}).length;

    if (contCount + voteCount === total && total > 0) {
      if (voteCount > contCount) {
        await roomRef.update({ state: "voting", phase: "voting" });
      } else {
        // Continue next round, no new word/impostor
        await roomRef.update({
          state: "turn",
          currentTurnIndex: 0,
          currentWord: null,
          phase: "turn",
          roundNumber: (room.roundNumber || 1) + 1,
          votesContinue: {},
          votesVote: {},
          finalVotes: {},
          resultsMessage: null,
        });
      }
    }
  }

  if (room.state === "voting") {
    const votes = Object.values(room.finalVotes || {});
    if (votes.length === total) {
      const counts = {};
      votes.forEach((v) => {
        counts[v] = (counts[v] || 0) + 1;
      });

      let maxVotes = 0;
      let maxPlayer = null;
      for (const [pid, count] of Object.entries(counts)) {
        if (count > maxVotes) {
          maxVotes = count;
          maxPlayer = pid;
        }
      }

      if (maxPlayer === room.impostorId) {
        await roomRef.update({
          state: "results",
          resultsMessage: "Crewmates win! The impostor was caught.",
        });
      } else {
        await roomRef.update({
          state: "results",
          resultsMessage: "Impostor wins! Wrong person was voted out.",
        });
      }
    }
  }
}

// -------- EVENT LISTENERS --------
joinRoomBtn.onclick = joinRoom;
createRoomBtn.onclick = createRoom;
startGameBtn.onclick = startGame;
submitWordBtn.onclick = submitWord;
voteContinueBtn.onclick = voteContinue;
voteNowBtn.onclick = voteNow;
rematchBtn.onclick = rematch;

// Enter key submits word when focused
wordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    submitWord();
  }
});

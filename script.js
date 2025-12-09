// -------- FIREBASE INIT --------
// Put your Firebase config here
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

// -------- GLOBALS --------
let playerId = crypto.randomUUID();
let playerName = "";
let roomId = "";
let roomRef = null;
let unsubscribe = null;
let playerRole = null; // "impostor" or "crewmate"

// -------- DOM --------
const screens = {
  login: document.getElementById("loginScreen"),
  lobby: document.getElementById("lobbyScreen"),
  turn: document.getElementById("turnScreen"),
  roundEnd: document.getElementById("roundEndScreen"),
  voting: document.getElementById("votingScreen"),
  results: document.getElementById("resultsScreen"),
};

function show(screen) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screen.classList.remove("hidden");
}

// -------- UI ELEMENTS --------
const playerNameInput = document.getElementById("playerNameInput");
const roomCodeInput = document.getElementById("roomCodeInput");
const roomPasswordInput = document.getElementById("roomPasswordInput");
const loginError = document.getElementById("loginError");

const lobbyCodeSpan = document.getElementById("lobbyCode");
const lobbyHostSpan = document.getElementById("lobbyHost");
const playerListUl = document.getElementById("playerList");
const startGameBtn = document.getElementById("startGameBtn");

const categoryDisplay = document.getElementById("categoryDisplay");
const hintDisplay = document.getElementById("hintDisplay");
const turnIndicator = document.getElementById("turnIndicator");

const shownWordDiv = document.getElementById("shownWord");
const wordInputSection = document.getElementById("wordInputSection");
const wordInput = document.getElementById("wordInput");
const submitWordBtn = document.getElementById("submitWordBtn");

const roundEndScreen = document.getElementById("roundEndScreen");
const continueBtn = document.getElementById("continueBtn");
const voteNowBtn = document.getElementById("voteNowBtn");
const roundEndMsg = document.getElementById("roundEndMsg");

const votingScreen = document.getElementById("votingScreen");
const votingListUl = document.getElementById("votingList");
const votingMsg = document.getElementById("votingMsg");

const resultsMessage = document.getElementById("resultsMessage");
const rematchBtn = document.getElementById("rematchBtn");

// -------- EVENTS --------
document.getElementById("joinRoomBtn").onclick = joinRoom;
document.getElementById("createRoomBtn").onclick = createRoom;
submitWordBtn.onclick = submitWord;
continueBtn.onclick = voteContinue;
voteNowBtn.onclick = voteNow;
rematchBtn.onclick = rematch;
startGameBtn.onclick = startGame;

// -------- WORD BANK --------
const wordBank = {
  Animals: [
    { word: "elephant", hint: "Very big" },
    { word: "cat", hint: "Small and quiet" },
    { word: "giraffe", hint: "Very tall" },
    { word: "lion", hint: "King of jungle" },
  ],
  Food: [
    { word: "pizza", hint: "Popular" },
    { word: "apple", hint: "Red or green" },
    { word: "rice", hint: "Grain" },
  ],
  Sports: [
    { word: "soccer", hint: "Ball and running" },
    { word: "boxing", hint: "Punching" },
    { word: "swimming", hint: "Water" },
  ],
};

// -------- UTILS --------
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// -------- JOIN ROOM --------
async function joinRoom() {
  clearLoginError();
  playerName = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim();
  const pass = roomPasswordInput.value.trim();

  if (!playerName || !code || !pass) {
    showLoginError("Fill all fields");
    return;
  }

  roomId = code;
  roomRef = db.collection("rooms").doc(roomId);

  try {
    const snap = await roomRef.get();
    if (!snap.exists) {
      showLoginError("Room not found");
      return;
    }
    const roomData = snap.data();

    // Check password hash match
    const passHash = await hashPassword(pass);
    if (roomData.passwordHash !== passHash) {
      showLoginError("Wrong password");
      return;
    }

    // Add player if not exists
    const players = roomData.players || [];
    if (!players.find((p) => p.id === playerId)) {
      players.push({ id: playerId, name: playerName });
      await roomRef.update({ players });
    }

    attachListener();
    show(screens.lobby);
  } catch (err) {
    showLoginError("Error joining room");
    console.error(err);
  }
}

// -------- CREATE ROOM --------
async function createRoom() {
  clearLoginError();
  playerName = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim();
  const pass = roomPasswordInput.value.trim();

  if (!playerName || !code || !pass) {
    showLoginError("Fill all fields");
    return;
  }

  roomId = code;
  roomRef = db.collection("rooms").doc(roomId);

  try {
    const passHash = await hashPassword(pass);

    await roomRef.set({
      passwordHash: passHash,
      hostId: playerId,
      players: [{ id: playerId, name: playerName }],
      state: "lobby",
      currentTurnIndex: 0,
      currentWord: null,
      roundNumber: 1,
      impostorId: null,
      category: null,
      secretWord: null,
      impostorHint: null,
      phase: "lobby",
      votesContinue: {},
      votesVote: {},
      finalVotes: {},
      resultsMessage: null,
    });

    attachListener();
    show(screens.lobby);
  } catch (err) {
    showLoginError("Error creating room");
    console.error(err);
  }
}

function clearLoginError() {
  loginError.textContent = "";
}
function showLoginError(msg) {
  loginError.textContent = msg;
}

// -------- LISTENER --------
function attachListener() {
  if (unsubscribe) unsubscribe();

  unsubscribe = roomRef.onSnapshot(async (snap) => {
    if (!snap.exists) return;
    const room = snap.data();

    updateLobbyUI(room);

    if (room.state === "lobby") {
      show(screens.lobby);
    } else if (room.state === "turn") {
      show(screens.turn);
      updateTurnUI(room);
    } else if (room.state === "roundEnd") {
      show(screens.roundEnd);
      updateRoundEndUI(room);
    } else if (room.state === "voting") {
      show(screens.voting);
      updateVotingUI(room);
    } else if (room.state === "results") {
      show(screens.results);
      resultsMessage.textContent = room.resultsMessage || "";
      updateRematchVisibility(room);
    }

    // Host logic for votes and rounds
    hostGameLogic(room);
  });
}

// -------- LOBBY UI --------
function updateLobbyUI(room) {
  lobbyCodeSpan.textContent = roomId || "";
  lobbyHostSpan.textContent = getPlayerName(room.hostId, room.players);
  playerRole = playerId === room.impostorId ? "impostor" : "crewmate";

  // Update player list
  playerListUl.innerHTML = "";
  if (room.players) {
    room.players.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = p.name;
      playerListUl.appendChild(li);
    });
  }

  // Show start game only for host
  if (playerId === room.hostId) {
    startGameBtn.classList.add("hostOnly", "visible");
  } else {
    startGameBtn.classList.remove("hostOnly", "visible");
  }
}

// -------- START GAME --------
async function startGame() {
  const roomSnap = await roomRef.get();
  const room = roomSnap.data();
  if (!room) return;

  const players = room.players;
  if (!players || players.length < 3) {
    alert("Need at least 3 players to start");
    return;
  }

  // Pick impostor randomly
  const impostor = players[Math.floor(Math.random() * players.length)];

  // Pick category randomly from wordBank keys
  const categories = Object.keys(wordBank);
  const category = categories[Math.floor(Math.random() * categories.length)];

  // Pick a word + hint from category
  const { word: secretWord, hint: impostorHint } = wordBank[category][
    Math.floor(Math.random() * wordBank[category].length)
  ];

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

// -------- TURN UI --------
function updateTurnUI(room) {
  categoryDisplay.textContent = `Category: ${room.category}`;
  turnIndicator.textContent = `Current turn: ${
    room.players[room.currentTurnIndex]?.name || ""
  }`;
  wordInput.value = "";
  shownWordDiv.classList.add("hidden");
  hintDisplay.textContent = "";

  // Show hint only to impostor
  if (playerId === room.impostorId) {
    hintDisplay.textContent = `Hint: ${room.impostorHint}`;
    shownWordDiv.classList.add("hidden");
  } else {
    // Show the secret word to crewmates
    hintDisplay.textContent = "";
    shownWordDiv.textContent = room.secretWord || "";
    shownWordDiv.classList.remove("hidden");
  }

  // Show input only if it's your turn
  if (room.players[room.currentTurnIndex]?.id === playerId) {
    wordInputSection.classList.remove("hidden");
  } else {
    wordInputSection.classList.add("hidden");
  }
}

// -------- SUBMIT WORD --------
async function submitWord() {
  const roomSnap = await roomRef.get();
  const room = roomSnap.data();
  if (!room) return;

  if (room.players[room.currentTurnIndex].id !== playerId) return;

  const word = wordInput.value.trim();
  if (!word) return;

  await roomRef.update({
    currentWord: word,
  });

  // Show the word for 3 seconds, then advance turn or end round
  setTimeout(async () => {
    const freshSnap = await roomRef.get();
    const freshRoom = freshSnap.data();
    if (!freshRoom) return;

    let nextIndex = freshRoom.currentTurnIndex + 1;

    if (nextIndex >= freshRoom.players.length) {
      // Round ends
      await roomRef.update({
        state: "roundEnd",
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
      });
    }
  }, 3000);
}

// -------- ROUND END UI --------
function updateRoundEndUI(room) {
  const contCount = Object.keys(room.votesContinue || {}).length;
  const voteCount = Object.keys(room.votesVote || {}).length;
  const total = room.players.length;
  roundEndMsg.textContent = `Continue: ${contCount} / Vote: ${voteCount} / Players: ${total}`;
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

// -------- VOTING UI --------
function updateVotingUI(room) {
  votingListUl.innerHTML = "";
  room.players.forEach((p) => {
    // Impostor can't vote for self, but voting UI shows all players except self
    if (p.id === playerId) return;

    const li = document.createElement("li");
    li.textContent = p.name;
    li.onclick = () => voteForPlayer(p.id);
    votingListUl.appendChild(li);
  });
  votingMsg.textContent = "Click a player to vote them out.";
}

// -------- VOTE FOR PLAYER --------
async function voteForPlayer(votedId) {
  await roomRef.update({
    [`finalVotes.${playerId}`]: votedId,
  });
}

// -------- REMATCH --------
async function rematch() {
  const roomSnap = await roomRef.get();
  const room = roomSnap.data();
  if (!room) return;

  if (playerId !== room.hostId) {
    alert("Only the host can start a rematch");
    return;
  }

  // Reset game data
  await roomRef.update({
    state: "lobby",
    currentTurnIndex: 0,
    currentWord: null,
    roundNumber: 1,
    impostorId: null,
    category: null,
    secretWord: null,
    impostorHint: null,
    phase: "lobby",
    votesContinue: {},
    votesVote: {},
    finalVotes: {},
    resultsMessage: null,
  });
}

// -------- HELPER: GET PLAYER NAME --------
function getPlayerName(id, players) {
  const p = players.find((p) => p.id === id);
  return p ? p.name : "";
}

// -------- HASH PASSWORD --------
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// -------- HOST LOGIC --------
async function hostGameLogic(room) {
  if (!room.hostId || playerId !== room.hostId) return;

  const total = room.players.length;

  // Handle continue/vote tally after round end
  if (room.state === "roundEnd") {
    const contCount = Object.keys(room.votesContinue || {}).length;
    const voteCount = Object.keys(room.votesVote || {}).length;

    if (contCount + voteCount === total && total > 0) {
      if (voteCount > contCount) {
        await roomRef.update({ state: "voting", phase: "voting" });
      } else {
        await startNextRound(room);
      }
    }
  }

  // Handle vote tallying in voting phase
  if (room.state === "voting") {
    const votes = Object.values(room.finalVotes || {});
    if (votes.length === total) {
      // Tally votes
      const counts = {};
      votes.forEach((v) => {
        counts[v] = (counts[v] || 0) + 1;
      });

      // Find max votes
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

// -------- START NEXT ROUND --------
async function startNextRound(room) {
  const players = room.players;
  if (!players || players.length < 3) {
    await roomRef.update({
      state: "results",
      resultsMessage: "Not enough players to continue.",
    });
    return;
  }

  // Pick new impostor randomly
  const impostor = players[Math.floor(Math.random() * players.length)];

  // Pick new category and word
  const categories = Object.keys(wordBank);
  const category = categories[Math.floor(Math.random() * categories.length)];

  const { word: secretWord, hint: impostorHint } = wordBank[category][
    Math.floor(Math.random() * wordBank[category].length)
  ];

  await roomRef.update({
    state: "turn",
    category,
    secretWord,
    impostorHint,
    impostorId: impostor.id,
    currentTurnIndex: 0,
    currentWord: null,
    roundNumber: (room.roundNumber || 1) + 1,
    phase: "turn",
    votesContinue: {},
    votesVote: {},
    finalVotes: {},
    resultsMessage: null,
  });
}

// -------- UPDATE REMATCH BUTTON --------
function updateRematchVisibility(room) {
  if (playerId === room.hostId) {
    rematchBtn.classList.add("hostOnly", "visible");
  } else {
    rematchBtn.classList.remove("hostOnly", "visible");
  }
}

// -------- INIT --------
show(screens.login);

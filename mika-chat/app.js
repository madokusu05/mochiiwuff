const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messagesElement = document.querySelector("#messages");
const sendButton = document.querySelector("#send-button");
const clearButton = document.querySelector("#clear-chat");

const welcomeMessage =
  "Salut ! Moi, c’est Mika. Je suis là pour discuter, t’écouter ou simplement partager un petit moment tranquille. Comment tu te sens aujourd’hui ?";
let conversation = [];
let waiting = false;

function scrollToLatest() {
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function addMessage(role, text, options = {}) {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "message-user" : "message-mika"}`;
  if (options.error) article.classList.add("message-error");
  if (options.typing) article.classList.add("typing");

  if (role !== "user") {
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.src = "/mika-avatar.svg";
    image.alt = "";
    avatar.append(image);
    article.append(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  bubble.append(paragraph);

  if (!options.typing) {
    const time = document.createElement("time");
    time.textContent = "maintenant";
    bubble.append(time);
  }

  article.append(bubble);
  messagesElement.append(article);
  scrollToLatest();
  return article;
}

function setWaiting(value) {
  waiting = value;
  document.dispatchEvent(
    new CustomEvent("mika:waiting", { detail: value }),
  );
  sendButton.disabled = value;
  input.disabled = value;
  sendButton.setAttribute("aria-label", value ? "Mika prépare une réponse" : "Envoyer le message");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || waiting) return;

  input.value = "";
  input.style.height = "auto";
  addMessage("user", text);
  conversation = conversation.slice(-78);
  conversation.push({ role: "user", content: text });
  setWaiting(true);
  const typing = addMessage("assistant", "Mika prépare une réponse…", { typing: true });

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Une erreur est survenue.");

    conversation.push({ role: "assistant", content: result.reply });
    typing.remove();
    addMessage("assistant", result.reply);
  } catch (error) {
    typing.remove();
    addMessage("assistant", error.message, { error: true });
  } finally {
    setWaiting(false);
    input.focus();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

clearButton.addEventListener("click", () => {
  conversation = [];
  messagesElement.replaceChildren();
  addMessage("assistant", welcomeMessage);
  input.focus();
});

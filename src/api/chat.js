const chatObject = uniCloud.importObject('babyplace-chat');

export function sendChatMessage(message, sessionId) {
  return chatObject.send({ message, sessionId });
}

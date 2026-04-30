async function injectLead(phone, message) {
  return {
    type: "incoming_message",
    payload: {
      user_id: phone,
      message: message
    }
  };
}

module.exports = {
  injectLead
};

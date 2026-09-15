const register = (req, res) => {
  res.status(200).json({
    message: "Register controller reached",
  });
};

const login = (req, res) => {
  res.status(200).json({
    message: "Login controller reached",
  });
};

const getCurrentUser = (req, res) => {
  res.status(200).json({
    message: "Current user controller reached",
  });
};

module.exports = {
  register,
  login,
  getCurrentUser,
};

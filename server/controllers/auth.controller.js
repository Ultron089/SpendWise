const bcrypt = require("bcrypt");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

const register = async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof name === "string" ? name.trim() : "";

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      typeof password !== "string" ||
      password.length === 0 ||
      (name !== undefined && typeof name !== "string")
    ) {
      return res.status(400).json({
        message: "A valid email and password are required",
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "User already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: normalizedName || undefined,
    });

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "User already exists",
      });
    }

    console.error("Registration error:", error.message);

    res.status(500).json({
      message: "Server error",
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // 2. Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // 3. Compare entered password with stored hash
    const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // 4. Create JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // 5. Login successful
    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    res.status(500).json({
      message: "Server error",
    });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-passwordHash");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Get current user error:", error.message);

    res.status(500).json({
      message: "Server error",
    });
  }
};

module.exports = {
  register,
  login,
  getCurrentUser,
};

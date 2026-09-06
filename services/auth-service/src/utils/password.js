import bcrypt from 'bcryptjs';
import config from '../config/config.js';

// Hash password
const hashPassword = async (password) => {
  return await bcrypt.hash(
    password,
    config.bcrypt.saltRounds
  );
};

// Compare password with hash
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(
    password,
    hash
  );
};

// Validate password strength
const validatePasswordStrength = (password) => {
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[@$!%*?&]/.test(password);
  const isLongEnough = password.length >= 8;
  return {
    isValid:
      hasUpperCase &&
      hasLowerCase &&
      hasNumber &&
      hasSpecialChar &&
      isLongEnough,
    errors: {
      hasUpperCase,
      hasLowerCase,
      hasNumber,
      hasSpecialChar,
      isLongEnough
    }
  };
};

export {
  hashPassword,
  comparePassword,
  validatePasswordStrength
};
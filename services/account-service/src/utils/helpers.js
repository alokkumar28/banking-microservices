// Generate unique account number (10 digits)
const generateAccountNumber = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${timestamp}${random}`;
};

// Generate reference ID for transactions
const generateReferenceId = () => {
  const prefix = "TXN";
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${prefix}${timestamp}${random}`;
};

// Calculate pagination metadata
const getPagination = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

// Get offset for pagination
const getOffset = (page, limit) => {
  return (page - 1) * limit;
};

// Format currency amount
const formatAmount = (amount) => {
  return parseFloat(amount).toFixed(2);
};

// Validate IFSC code
const isValidIfsc = (ifsc) => {
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  return ifscRegex.test(ifsc);
};

export {
  generateAccountNumber,
  generateReferenceId,
  getPagination,
  getOffset,
  formatAmount,
  isValidIfsc,
};
import crypto from "crypto";

const generateEventId = () => {
  return crypto.randomUUID();
};

const getOffset = (page, limit) => {
  return (page - 1) * limit;
};

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

const renderTemplate = (template, variables = {}) => {
  if (!template) {
    return "";
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match;
  });
};

const stripHtml = (html = "") => {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const formatDate = (date = new Date()) => {
  return new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatCurrency = (amount, currency = "INR") => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(Number(amount));
};

export {
  generateEventId,
  getOffset,
  getPagination,
  renderTemplate,
  stripHtml,
  sleep,
  formatDate,
  formatCurrency,
};

export default {
  generateEventId,
  getOffset,
  getPagination,
  renderTemplate,
  stripHtml,
  sleep,
  formatDate,
  formatCurrency,
};

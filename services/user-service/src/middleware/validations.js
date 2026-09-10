import Joi from "joi";
const createProfileSchema = Joi.object({
  mobileNumber: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required()
    .messages({
      "string.pattern.base":
        "Please provide a valid 10-digit Indian mobile number",
      "any.required": "Mobile number is required",
    }),

  dateOfBirth: Joi.date()
    .iso()
    .required()
    .custom((value, helpers) => {
      const today = new Date();
      let age = today.getFullYear() - value.getFullYear();
      const monthDifference = today.getMonth() - value.getMonth();
      if (
        monthDifference < 0 ||
        (monthDifference === 0 &&
          today.getDate() < value.getDate())
      ) {
        age--;
      }
      if (age < 18) {
        return helpers.error("dateOfBirth.minAge");
      }
      if (value > today) {
        return helpers.error("dateOfBirth.future");
      }
      return value;
    })
    .messages({
      "dateOfBirth.minAge":
        "User must be at least 18 years old",
      "dateOfBirth.future":
        "Date of birth cannot be in the future",
      "date.format":
        "Date of birth must be in YYYY-MM-DD format",
      "any.required":
        "Date of birth is required",
    }),

  gender: Joi.string()
    .valid("MALE", "FEMALE", "OTHER")
    .required()
    .messages({
      "any.only":
        "Gender must be MALE, FEMALE, or OTHER",
      "any.required":
        "Gender is required",
    }),

  occupation: Joi.string()
    .valid(
      "STUDENT",
      "EMPLOYED",
      "SELF_EMPLOYED",
      "BUSINESS",
      "OTHER"
    )
    .required()
    .messages({
      "any.only":
        "Invalid occupation",
      "any.required":
        "Occupation is required",
    }),

  address: Joi.string()
    .trim()
    .min(5)
    .max(500)
    .required()
    .messages({
      "string.min":
        "Address must be at least 5 characters",
      "string.max":
        "Address cannot exceed 500 characters",
      "any.required":
        "Address is required",
    }),

  city: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      "string.min":
        "City must be at least 2 characters",
      "any.required":
        "City is required",
    }),

  district: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      "string.min":
        "District must be at least 2 characters",
      "any.required":
        "District is required",
    }),

  state: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      "string.min":
        "State must be at least 2 characters",
      "any.required":
        "State is required",
    }),

  country: Joi.string()
    .trim()
    .valid("India")
    .default("India")
    .messages({
      "any.only":
        "Country must be India",
    }),

  pincode: Joi.string()
    .pattern(/^[1-9][0-9]{5}$/)
    .required()
    .messages({
      "string.pattern.base":
        "Please provide a valid 6-digit Indian pincode",
      "any.required":
        "Pincode is required",
    }),
});

const updateProfileSchema = Joi.object({
  mobileNumber: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .messages({
      "string.pattern.base":
        "Please provide a valid 10-digit Indian mobile number",
    }),

  dateOfBirth: Joi.date()
    .iso()
    .custom((value, helpers) => {
      const today = new Date();
      let age = today.getFullYear() - value.getFullYear();
      const monthDifference = today.getMonth() - value.getMonth();
      if (
        monthDifference < 0 ||
        (monthDifference === 0 &&
          today.getDate() < value.getDate())
      ) {
        age--;
      }
      if (value > today) {
        return helpers.error("dateOfBirth.future");
      }
      if (age < 18) {
        return helpers.error("dateOfBirth.minAge");
      }
      return value;
    })
    .messages({
      "dateOfBirth.minAge":
        "User must be at least 18 years old",
      "dateOfBirth.future":
        "Date of birth cannot be in the future",
    }),

  gender: Joi.string()
    .valid("MALE", "FEMALE", "OTHER")
    .messages({
      "any.only":
        "Gender must be MALE, FEMALE, or OTHER",
    }),

  occupation: Joi.string()
    .valid(
      "STUDENT",
      "EMPLOYED",
      "SELF_EMPLOYED",
      "BUSINESS",
      "OTHER"
    )
    .messages({
      "any.only":
        "Invalid occupation",
    }),

  address: Joi.string()
    .trim()
    .min(5)
    .max(500)
    .messages({
      "string.min":
        "Address must be at least 5 characters",
      "string.max":
        "Address cannot exceed 500 characters",
    }),

  city: Joi.string()
    .trim()
    .min(2)
    .max(100),

  district: Joi.string()
    .trim()
    .min(2)
    .max(100),

  state: Joi.string()
    .trim()
    .min(2)
    .max(100),

  country: Joi.string()
    .trim()
    .valid("India")
    .messages({
      "any.only":
        "Country must be India",
    }),

  pincode: Joi.string()
    .pattern(/^[1-9][0-9]{5}$/)
    .messages({
      "string.pattern.base":
        "Please provide a valid 6-digit Indian pincode",
    }),
}).min(1);

export {
  createProfileSchema,
  updateProfileSchema,
};
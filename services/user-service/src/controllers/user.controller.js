import { pool } from "../db/db.js";
import {
  createProfileSchema,
  updateProfileSchema,
} from "../middleware/validations.js";

// CREATE USER PROFILE
const createProfile = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = createProfileSchema.validate(
      req.body,
      {
        abortEarly: false,
      }
    );
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const userId = req.user.userId;
    const {
      mobileNumber,
      dateOfBirth,
      gender,
      occupation,
      address,
      city,
      district,
      state,
      country,
      pincode,
    } = value;
    const existingProfile = await client.query(
      `
      SELECT id
      FROM user_profiles
      WHERE user_id = $1
      `,
      [userId]
    );
    if (existingProfile.rows.length > 0) {
      return res.status(409).json({
        error: "Profile already exists",
        message: "User profile has already been created",
      });
    }
    const existingMobile = await client.query(
      `
      SELECT id
      FROM user_profiles
      WHERE mobile_number = $1
      `,
      [mobileNumber]
    );
    if (existingMobile.rows.length > 0) {
      return res.status(409).json({
        error: "Mobile number already exists",
        message:
          "This mobile number is already associated with a profile",
      });
    }
    const result = await client.query(
      `
      INSERT INTO user_profiles (
        user_id,
        mobile_number,
        date_of_birth,
        gender,
        occupation,
        address,
        city,
        district,
        state,
        country,
        pincode
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11
      )
      RETURNING
        id,
        user_id,
        mobile_number,
        date_of_birth,
        gender,
        occupation,
        address,
        city,
        district,
        state,
        country,
        pincode,
        created_at,
        updated_at
      `,
      [
        userId,
        mobileNumber,
        dateOfBirth,
        gender,
        occupation,
        address,
        city,
        district,
        state,
        country,
        pincode,
      ]
    );
    return res.status(201).json({
      message: "User profile created successfully",
      profile: result.rows[0],
    });
  } catch (error) {
    console.error("Create profile error:", error);
    return res.status(500).json({
      error: "Failed to create user profile",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// GET CURRENT USER PROFILE
const getProfile = async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.userId;
    const result = await client.query(
      `
      SELECT
        id,
        user_id,
        mobile_number,
        date_of_birth,
        gender,
        occupation,
        address,
        city,
        district,
        state,
        country,
        pincode,
        created_at,
        updated_at
      FROM user_profiles
      WHERE user_id = $1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Profile not found",
        message: "User profile has not been created yet",
      });
    }

    return res.status(200).json({
      profile: result.rows[0],
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({
      error: "Failed to get user profile",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// UPDATE CURRENT USER PROFILE
const updateProfile = async (req, res) => {
  const client = await pool.connect();
  try {
    const { error, value } = updateProfileSchema.validate(
      req.body,
      {
        abortEarly: false,
      }
    );
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const userId = req.user.userId;
    const existingProfile = await client.query(
      `
      SELECT id
      FROM user_profiles
      WHERE user_id = $1
      `,
      [userId]
    );
    if (existingProfile.rows.length === 0) {
      return res.status(404).json({
        error: "Profile not found",
        message: "Create your profile before updating it",
      });
    }
    if (value.mobileNumber) {
      const existingMobile = await client.query(
        `
        SELECT id
        FROM user_profiles
        WHERE mobile_number = $1
        AND user_id != $2
        `,
        [value.mobileNumber, userId]
      );
      if (existingMobile.rows.length > 0) {
        return res.status(409).json({
          error: "Mobile number already exists",
          message:
            "This mobile number is already associated with another profile",
        });
      }
    }
    const fields = [];
    const values = [];
    let parameterIndex = 1;
    for (const [key, valueToUpdate] of Object.entries(value)) {
      let columnName;
      switch (key) {
        case "mobileNumber":
          columnName = "mobile_number";
          break;
        case "dateOfBirth":
          columnName = "date_of_birth";
          break;
        case "gender":
          columnName = "gender";
          break;
        case "occupation":
          columnName = "occupation";
          break;
        case "address":
          columnName = "address";
          break;
        case "city":
          columnName = "city";
          break;
        case "district":
          columnName = "district";
          break;
        case "state":
          columnName = "state";
          break;
        case "country":
          columnName = "country";
          break;
        case "pincode":
          columnName = "pincode";
          break;
      }
      if (columnName) {
        fields.push(`${columnName} = $${parameterIndex}`);
        values.push(valueToUpdate);
        parameterIndex++;
      }
    }
    if (fields.length === 0) {
      return res.status(400).json({
        error: "No fields to update",
      });
    }
    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(userId);
    const result = await client.query(
      `
      UPDATE user_profiles
      SET ${fields.join(", ")}
      WHERE user_id = $${parameterIndex}
      RETURNING
        id,
        user_id,
        mobile_number,
        date_of_birth,
        gender,
        occupation,
        address,
        city,
        district,
        state,
        country,
        pincode,
        created_at,
        updated_at
      `,
      values
    );
    return res.status(200).json({
      message: "User profile updated successfully",
      profile: result.rows[0],
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({
      error: "Failed to update user profile",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

// DELETE CURRENT USER PROFILE
const deleteProfile = async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.userId;
    const result = await client.query(
      `
      UPDATE user_profiles
      SET updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING id
      `,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Profile not found",
      });
    }
    return res.status(200).json({
      message: "User profile deactivation requested",
    });
  } catch (error) {
    console.error("Delete profile error:", error);
    return res.status(500).json({
      error: "Failed to delete user profile",
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

export {
  createProfile,
  getProfile,
  updateProfile,
  deleteProfile,
};

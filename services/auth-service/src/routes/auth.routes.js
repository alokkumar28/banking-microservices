import express from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  changePassword
} from '../controllers/auth.controller.js';

import {
  authenticate
} from '../middleware/jwt.js';

const router = express.Router();
router.post('/register',register );
router.post('/login',login );
router.post('/refresh',refreshToken );
router.post('/logout',authenticate,logout );
router.get('/me',authenticate,getCurrentUser);
router.post('/change-password',authenticate,changePassword);

export default router;
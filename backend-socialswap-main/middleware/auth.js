const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const authHeader = req.header('authorization') || req.header('x-auth-token');

  if (!authHeader) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // support both "Bearer <token>" and raw token in x-auth-token
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = decoded; // contains { id, uid, ... }
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

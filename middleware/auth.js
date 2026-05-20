import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

export const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

/** Courier may only act on their own user id unless admin. */
export const authorizeCourierSelf = (paramName = 'courierId') => {
  return (req, res, next) => {
    if (req.user.role === 'admin' || req.user.role === 'owner') return next();
    const targetId = Number(req.params[paramName] ?? req.user.id);
    if (req.user.role === 'courier' && req.user.id === targetId) {
      return next();
    }
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
};

/** Admin və kuryer üçün company_id mütləqdir. */
export const requireTenant = (req, res, next) => {
  if (req.user.role === 'owner') {
    return res.status(403).json({ error: 'Owner bu endpointdən istifadə edə bilməz' });
  }
  if (!req.user.company_id) {
    return res.status(403).json({ error: 'Şirkət təyin edilməyib' });
  }
  next();
};
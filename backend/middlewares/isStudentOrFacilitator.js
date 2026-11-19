/**
 * Authorization middleware for student and facilitator feature routes.
 * NOTE: Platform administrators ('admin') are intentionally granted access
 * to support administrative oversight, audits, and instructor troubleshooting.
 */
const isStudentOrFacilitator = async (req, res, next) => {
  try {
    const role = req.user?.role;
    if (role === 'student' || role === 'facilitator' || role === 'admin') {
      return next();
    }
    return res.status(403).json({
      message: 'Access denied: Unauthorized role',
    });
  } catch (error) {
    console.error('Error in isStudentOrFacilitator middleware:', error);
    res.status(403).json({
      message: 'Access denied',
      error: error.message,
    });
  }
};

module.exports = isStudentOrFacilitator;

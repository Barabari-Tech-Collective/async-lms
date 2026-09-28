const { body, validationResult, query } = require('express-validator');

// This function checks the results of the body() rules
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(
      `WARNING || login || Validation errors found => `,
      errors.array(),
    );

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: errors.array()[0].msg, // Just sends the first error message
    });
  }
  next(); // No errors? Go to the controller.
};

const validate = (rules) => [...rules, handleValidationErrors];

// Auth validations
exports.validateLogin = validate([
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .notEmpty()
    .withMessage('Email is required'),
  body('password').notEmpty().withMessage('Password is required'),
]);

exports.validateSignup = validate([
  body('full_name').trim().notEmpty().withMessage('full_name is required'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .trim()
    .toLowerCase(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .optional()
    .isString()
    .trim()
    .toLowerCase()
    .isIn(['student', 'facilitator'])
    .withMessage('Invalid role'),
]);

// editor
exports.validateEditorStartup = validate([
  body('projectId').trim().notEmpty().withMessage('projectId is required'),
  // body('profile').trim().notEmpty().withMessage('profile is required'),
]);

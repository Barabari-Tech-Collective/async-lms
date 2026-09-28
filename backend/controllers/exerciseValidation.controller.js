const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { runTests, ENTRY_FILE } = require('../services/exerciseGrader');

const VALIDATION_ROOT = path.join(os.tmpdir(), 'codeguru-test-validation');

/**
 * POST /api/v1/admin/exercises/validate-tests
 * Body: { language, files: [{name, content}], test_cases: [{description, test_code}] }
 */
exports.validateExerciseTests = async (req, res) => {
  const {
    language,
    files,
    test_cases: testCases,
    test_kind: testKind,
    entry_function: entryFunction,
  } = req.body;

  if (!language) {
    return res
      .status(400)
      .json({ success: false, message: 'language is required' });
  }
  if (!Array.isArray(testCases) || testCases.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: 'At least one test case is required' });
  }
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'A reference solution is required to verify tests',
    });
  }

  const entryFile = ENTRY_FILE[language];
  if (!entryFile) {
    return res.status(400).json({
      success: false,
      message: `Test verification is not supported for the "${language}" environment`,
    });
  }
  if (!files.some((f) => f?.name === entryFile)) {
    return res.status(400).json({
      success: false,
      message: `The reference solution must include a file named "${entryFile}"`,
    });
  }

  const workspaceDir = path.join(
    VALIDATION_ROOT,
    crypto.randomBytes(12).toString('hex'),
  );

  try {
    fs.mkdirSync(workspaceDir, { recursive: true });

    for (const file of files) {
      if (!file?.name || typeof file.content !== 'string') continue;
      const filePath = path.join(workspaceDir, file.name);
      const relative = path.relative(workspaceDir, filePath);
      const isSafe =
        relative && !relative.startsWith('..') && !path.isAbsolute(relative);
      if (!isSafe) continue;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content, 'utf-8');
    }

    // Verification must run every case, visible and hidden alike — the whole
    // point is that a correct answer passes all of them.
    const result = await runTests(workspaceDir, language, {
      kind: testKind === 'data' ? 'data' : 'code',
      entry_function: entryFunction,
      cases: testCases,
    });

    return res.json({
      success: true,
      data: {
        ...result,
        // The exercise is only sound if the correct answer scores 100%.
        valid: result.failed === 0,
      },
    });
  } catch (err) {
    // The reference solution or the test code failed to run at all — that is a
    // legitimate validation result, not a server fault.
    return res.json({
      success: true,
      data: {
        valid: false,
        passed: 0,
        failed: testCases.length,
        total: testCases.length,
        results: [
          {
            description: 'Test suite could not run',
            passed: false,
            error: String(err.message || err).slice(0, 4000),
          },
        ],
      },
    });
  } finally {
    fs.rm(workspaceDir, { recursive: true, force: true }, () => {});
  }
};

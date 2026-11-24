const pool = require('../config/pg');
const OpenAI = require('openai');
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com' 
});
const { searchVideos, getVideoDetails } = require('./youtube.service');
const { applyNoiseFilter, applyQualityFilter, applyFreshnessFilter, applyViewCountFilter, rankVideos } = require('../utils/videoFilters');

/**
 * Main Orchestrator for the Video Recommendation Engine.
 * Fetches, filters, ranks, and handles multi-stage fallback.
 */
async function recommendBestVideo({ query, lessonId = null, excludeUrls = [], lessonTitle = "", topicTitle = "", courseTitle = "" }) {
  let fallbackStage = 0;
  let errorMessage = null;
  let selectedUrl = null;
  let totalFetched = 0;
  let totalPassed = 0;
  let finalVideos = [];

  try {
    // 1. Fetch initial search results (up to 15)
    let videos = await searchVideos(query, 15);
    totalFetched = videos.length;

    if (videos.length === 0) {
      throw new Error('YouTube returned 0 results for this query.');
    }

    // 2. Fetch detailed stats for all returned videos
    const videoIds = videos.map(v => v.videoId);
    const detailsMap = await getVideoDetails(videoIds);

    // Merge details
    videos = videos.map(v => ({
      ...v,
      duration: detailsMap[v.videoId]?.duration,
      viewCount: detailsMap[v.videoId]?.viewCount,
      likeCount: detailsMap[v.videoId]?.likeCount,
    }));

    // 3. Always apply Noise filter (we never want shorts or 5 hour streams)
    videos = applyNoiseFilter(videos);

    // 4. Fetch whitelist for Authority scoring
    const whitelistResult = await pool.query(`SELECT channel_id FROM channel_whitelist`);
    const whitelistMap = {};
    whitelistResult.rows.forEach(r => { whitelistMap[r.channel_id] = true; });

    // ── DEDUPLICATION ──────────────────────────────────────────────────────
    const excludeSet = new Set(excludeUrls);
    let novelVideos = videos.filter(v => !excludeSet.has(v.url));
    
    // Fallback: If literally all results are duplicates (extremely rare), we just use the original list
    // so we don't crash, but typically novelVideos will have plenty of candidates.
    if (novelVideos.length > 0) {
      videos = novelVideos;
    }

    // ── MULTI-STAGE FALLBACK ───────────────────────────────────────────────

    // Stage 1: Strict Filters (10k views, 2 years, 1.5% likes)
    let passedVideos = applyViewCountFilter(videos, 10000);
    passedVideos = applyFreshnessFilter(passedVideos, 2);
    passedVideos = applyQualityFilter(passedVideos);

    if (passedVideos.length > 0) {
      fallbackStage = 1;
    } else {
      // Stage 2: Relax Freshness and Views (5k views, 5 years, 1.5% likes)
      passedVideos = applyViewCountFilter(videos, 5000);
      passedVideos = applyFreshnessFilter(passedVideos, 5);
      passedVideos = applyQualityFilter(passedVideos);

      if (passedVideos.length > 0) {
        fallbackStage = 2;
      } else {
        // Stage 4: Drop Freshness entirely, but keep minimum views (1k views)
        // This is crucial for old topics (like Java) where top videos might be 6-8 years old.
        passedVideos = applyViewCountFilter(videos, 1000);
        
        if (passedVideos.length > 0) {
          fallbackStage = 4;
        } else {
          // Stage 5: Absolute desperation (just return whatever survived the noise filter)
          passedVideos = videos;
          fallbackStage = 5;
        }
      }
    }

    // 5. Rank surviving videos mathematically
    if (passedVideos.length > 0) {
      finalVideos = rankVideos(passedVideos, whitelistMap, query);
      selectedUrl = finalVideos[0].url;
      totalPassed = passedVideos.length;

      // 6. LLM-Powered Semantic Selection (Agentic Filtering)
      if (lessonTitle) {
        try {
          const candidates = finalVideos.slice(0, 10).map(v => ({
            videoId: v.videoId,
            title: v.title,
            channel: v.channelTitle
          }));

          const prompt = `You are an elite, domain-agnostic Curriculum Director. 
We are teaching a lesson strictly focused on "${lessonTitle}" within the topic "${topicTitle}" for the course "${courseTitle}".

Here are the top ${candidates.length} YouTube videos we found.

CRITICAL RULES FOR SELECTION:
1. DOMAIN ALIGNMENT: The winning video MUST match the overarching domain of the course. If the course is about "Soil Health", reject construction foundation videos. If the course is "Beauty", reject digital art videos. If the course is "Java", reject Python/C++ videos.
2. HYPER-SPECIFICITY: The video must explicitly cover the core concept of "${lessonTitle}". Reject broad/generic videos if a highly specific one exists.
3. EDUCATIONAL INTENT: Prefer titles that indicate high educational value appropriate for the domain ("Tutorial", "Explained", "Step-by-step", "Demonstration").

Candidates:
${JSON.stringify(candidates, null, 2)}

Analyze the titles and select the single best videoId that perfectly matches the lesson's exact topic and course domain. 
Return ONLY a valid JSON object: { "best_videoId": "the_id_here" }`;

          const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' }
          });

          const parsed = JSON.parse(response.choices[0].message.content);
          if (parsed.best_videoId) {
            const bestIndex = finalVideos.findIndex(v => v.videoId === parsed.best_videoId);
            if (bestIndex > -1) {
              // Move the LLM's chosen video to the very top
              const bestVideo = finalVideos.splice(bestIndex, 1)[0];
              finalVideos.unshift(bestVideo);
              selectedUrl = bestVideo.url;
            }
          }
        } catch (err) {
          console.warn("LLM Semantic Selection failed, falling back to math ranking:", err.message);
        }
      }

    } else {
      // Stage 5: Truly empty
      fallbackStage = 5;
      selectedUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    }

  } catch (err) {
    errorMessage = err.message;
    selectedUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    fallbackStage = -1;
  }

  // 6. Log the pipeline run asynchronously (don't block the return)
  if (lessonId) {
    pool.query(`
      INSERT INTO video_pipeline_logs 
      (lesson_id, query_used, videos_fetched, videos_passed, selected_url, fallback_stage, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [lessonId, query, totalFetched, totalPassed, selectedUrl, fallbackStage, errorMessage])
    .catch(err => console.error('Failed to log video pipeline:', err.message));
  }

  // Return the best single URL, and the array of ranked videos if frontend wants to offer choices
  return {
    video_url: selectedUrl,
    video_results: finalVideos.slice(0, 3) // Top 3 choices for the user
  };
}

module.exports = {
  recommendBestVideo
};

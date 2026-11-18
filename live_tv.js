
const express = require("express");
const router = express.Router();

const IPTV_CHANNELS =
  "https://iptv-org.github.io/api/channels.json";

const IPTV_STREAMS =
  "https://iptv-org.github.io/api/streams.json";

const supabase = require("@supabase/supabase-js").createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --------------------------------------------------
// IMPORT SECURITY
// --------------------------------------------------

function verifyImportSecret(req, res, next) {
  const suppliedSecret = req.headers["x-import-secret"];
  const expectedSecret = process.env.LIVE_TV_IMPORT_SECRET;

  if (
    !expectedSecret ||
    typeof suppliedSecret !== "string" ||
    suppliedSecret !== expectedSecret
  ) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized import request.",
    });
  }

  next();
}

// --------------------------------------------------
// IMPORT WORLDWIDE CHANNEL DIRECTORY
// Imported streams remain disabled.
// --------------------------------------------------

router.post("/import", verifyImportSecret, async (req, res) => {
  try {
    console.log("KENT STREAM: Starting worldwide IPTV import.");

    const [channelResponse, streamResponse] = await Promise.all([
      fetch(IPTV_CHANNELS),
      fetch(IPTV_STREAMS),
    ]);

    if (!channelResponse.ok || !streamResponse.ok) {
      throw new Error("Unable to download IPTV directory data.");
    }

    const [channels, streams] = await Promise.all([
      channelResponse.json(),
      streamResponse.json(),
    ]);

    const channelMap = new Map();

    for (const channel of channels) {
      if (channel.id && channel.name) {
        channelMap.set(channel.id, channel);
      }
    }

    const streamGroups = new Map();

    for (const stream of streams) {
      if (
        !stream.channel ||
        !stream.url ||
        !/^https?:\/\//i.test(stream.url) ||
        !/\.m3u8(?:$|[?#])/i.test(stream.url)
      ) {
        continue;
      }

      if (!channelMap.has(stream.channel)) continue;

      if (!streamGroups.has(stream.channel)) {
        streamGroups.set(stream.channel, []);
      }

      streamGroups.get(stream.channel).push(stream);
    }

    let importedChannels = 0;
    let importedStreams = 0;
    let failedRecords = 0;

    const channelEntries = Array.from(streamGroups.entries());

    for (let start = 0; start < channelEntries.length; start += 100) {
      const batch = channelEntries.slice(start, start + 100);

      const channelRows = batch.map(([channelId]) => {
        const channel = channelMap.get(channelId);

        return {
          source_channel_id: channel.id,
          name: channel.name,
          country: channel.country || null,
          languages: channel.languages || [],
          categories: channel.categories || [],
          logo_url: channel.logo || null,
          website: channel.website || null,
          is_published: false,
          rights_status: "pending",
        };
      });

      const { error: channelError } = await supabase
        .from("live_channels")
        .upsert(channelRows, {
          onConflict: "source_channel_id",
        });

      if (channelError) {
        console.error("Channel batch error:", channelError.message);
        failedRecords += batch.length;
        continue;
      }

      const channelIds = batch.map(([channelId]) => channelId);

      const { data: savedChannels, error: lookupError } = await supabase
        .from("live_channels")
        .select("id,source_channel_id")
        .in("source_channel_id", channelIds);

      if (lookupError) {
        console.error("Channel lookup error:", lookupError.message);
        failedRecords += batch.length;
        continue;
      }

      importedChannels += savedChannels.length;

      const databaseIds = new Map(
        savedChannels.map((item) => [
          item.source_channel_id,
          item.id,
        ])
      );

      const streamRows = [];

      for (const [channelId, sourceStreams] of batch) {
        const databaseId = databaseIds.get(channelId);

        if (!databaseId) continue;

        for (const stream of sourceStreams) {
          streamRows.push({
            channel_id: databaseId,
            source_url: stream.url,
            source_name: "iptv-org",
            is_enabled: false,
            health_status: "unknown",
          });
        }
      }

      for (let i = 0; i < streamRows.length; i += 500) {
        const streamBatch = streamRows.slice(i, i + 500);

        const { error: streamError } = await supabase
          .from("live_streams")
          .upsert(streamBatch, {
            onConflict: "channel_id,source_url",
            ignoreDuplicates: true,
          });

        if (streamError) {
          console.error("Stream batch error:", streamError.message);
          failedRecords += streamBatch.length;
        } else {
          importedStreams += streamBatch.length;
        }
      }
    }

    console.log("KENT STREAM import completed.", {
      importedChannels,
      importedStreams,
      failedRecords,
    });

    return res.json({
      success: true,
      message: "Worldwide channel directory import completed.",
      imported_channels: importedChannels,
      imported_streams: importedStreams,
      failed_records: failedRecords,
      published: false,
      rights_approved: false,
    });
  } catch (error) {
    console.error("Live TV import error:", error);

    return res.status(500).json({
      success: false,
      error: "Live TV import failed.",
    });
  }
});

// --------------------------------------------------
// PUBLIC WORLDWIDE CHANNEL DIRECTORY
// Displays imported channels regardless of publication.
// Does not grant permission to play their streams.
// --------------------------------------------------

router.get("/channels", async (req, res) => {
  try {
    const page = Math.max(
      0,
      Number.parseInt(req.query.page, 10) || 0
    );

    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 30)
    );

    let query = supabase
      .from("live_channels")
      .select(
        "id,source_channel_id,name,country,languages,categories,logo_url,website",
        { count: "exact" }
      )
      .order("name")
      .range(page * limit, page * limit + limit - 1);

    if (req.query.country) {
      query = query.eq("country", String(req.query.country));
    }

    if (req.query.category) {
      query = query.contains("categories", [
        String(req.query.category),
      ]);
    }

    if (req.query.search) {
      const search = String(req.query.search)
        .replace(/[,%()]/g, " ")
        .trim()
        .slice(0, 100);

      if (search) {
        query = query.ilike("name", `%${search}%`);
      }
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({
      success: true,
      page,
      limit,
      total: count || 0,
      directory: "IPTV-org",
      channels: data || [],
    });
  } catch (error) {
    console.error("Live TV catalogue error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to load live channels.",
    });
  }
});

// --------------------------------------------------
// STREAM PLAYBACK
// Only explicitly approved channels and enabled
// streams can be played.
// --------------------------------------------------

router.get("/channels/:id/streams", async (req, res) => {
  try {
    const { data: channel, error: channelError } =
      await supabase
        .from("live_channels")
        .select("id")
        .eq("id", req.params.id)
        .eq("is_published", true)
        .eq("rights_status", "approved")
        .maybeSingle();

    if (channelError) throw channelError;

    if (!channel) {
      return res.status(403).json({
        success: false,
        error: "This channel is listed in the directory but is not currently authorised for playback.",
        streams: [],
      });
    }

    const { data, error } = await supabase
      .from("live_streams")
      .select("id,source_url,health_status")
      .eq("channel_id", channel.id)
      .eq("is_enabled", true);

    if (error) throw error;

    return res.json({
      success: true,
      streams: data || [],
    });
  } catch (error) {
    console.error("Channel streams error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to load channel streams.",
      streams: [],
    });
  }
});

module.exports = router;

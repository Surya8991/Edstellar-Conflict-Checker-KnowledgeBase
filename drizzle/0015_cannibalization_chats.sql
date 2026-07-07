-- Conversation log for the Keyword Cannibalization AI Assistant (§18O).
-- Each row is one turn: the pasted URLs/keywords, the optional question, the
-- matched conflict data, and Groq's answer. Grouped by conversation_id.
CREATE TABLE IF NOT EXISTS cannibalization_chats (
  id              serial PRIMARY KEY,
  conversation_id text NOT NULL,
  inputs          jsonb NOT NULL DEFAULT '[]',   -- the pasted URLs/keywords
  question        text,                          -- optional free-text question
  matches         jsonb,                         -- the matched conflict data shown
  answer          jsonb,                         -- Groq's structured answer
  created_by      text,
  created_at      timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cannibalization_chats_conv_idx ON cannibalization_chats (conversation_id, created_at);

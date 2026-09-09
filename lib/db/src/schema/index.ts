// PATH IN YOUR REPO: lib/db/src/schema/index.ts
// This replaces the empty boilerplate. Built from the real data you exported
// from the "production" Neon branch (submissions.csv, newsletter.json, featured.json).
//
// NOTE: column TYPES (text vs uuid, timestamp precision, defaults) are inferred
// from the exported data, not introspected directly from Postgres. They should
// work fine for reading/writing, but if you ever get a chance to run
// `drizzle-kit pull` against the real DATABASE_URL, do that once to confirm
// exact types/defaults match 100%.

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

export const submissions = pgTable("submissions", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  instagram: text("instagram"),
  series: text("series"),
  credits: text("credits"),
  story: text("story"),
  issue: text("issue"),
  status: text("status"), // e.g. "received", "reviewing", "accepted", "declined"
  notes: text("notes"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  rating: integer("rating").default(0),
});

export const newsletter = pgTable("newsletter", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const featured = pgTable("featured", {
  id: text("id").primaryKey(),
  series: text("series"),
  photographer: text("photographer"),
  instagram: text("instagram"),
  issue: text("issue"),
  story: text("story"),
  credits: text("credits"),
  status: text("status"), // e.g. "draft", "published"
  submissionId: text("submission_id"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  deadline: timestamp("deadline", { withTimezone: true }),
});

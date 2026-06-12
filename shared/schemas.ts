import { z } from "zod";

export const taskStatusSchema = z.enum(["Open", "In Progress", "Blocked", "Done"]);
export const taskReminderModeSchema = z.enum(["automatic", "manual"]);

export const publicIdSchema = z.string().regex(/^[A-Z][0-9]{3,}$/);

export const personInputSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email().optional().or(z.literal("")),
});

export const taskInputSchema = z.object({
  description: z.string().trim().min(1),
  assigneePublicId: publicIdSchema.optional().nullable(),
  status: taskStatusSchema.default("Open"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  originMeetingPublicId: publicIdSchema.optional().nullable(),
  seriesPublicId: publicIdSchema.optional().nullable(),
  reminderMode: taskReminderModeSchema.default("automatic"),
  private: z.boolean().default(false),
});

export const meetingInputSchema = z.object({
  title: z.string().trim().min(1),
  startsAt: z.string().datetime(),
  meetingType: z.enum(["single", "recurring"]),
  seriesPublicId: publicIdSchema.optional().nullable(),
  summary: z.string().trim().default(""),
  attendeePublicIds: z.array(publicIdSchema).default([]),
  taskPublicIds: z.array(publicIdSchema).default([]),
  private: z.boolean().default(false),
});

export const meetingSeriesInputSchema = z.object({
  title: z.string().trim().min(1),
  cadenceLabel: z.string().trim().optional().or(z.literal("")),
  active: z.boolean().default(true),
});

export const decisionInputSchema = z.object({
  decisionText: z.string().trim().min(1),
  decisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  context: z.string().trim().default(""),
  meetingPublicId: publicIdSchema.optional().nullable(),
});

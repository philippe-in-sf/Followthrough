import { z } from "zod";
import { formatPersonName, parsePersonName } from "./personName.js";

export const taskStatusSchema = z.enum(["Open", "In Progress", "Blocked", "Done"]);
export const taskReminderModeSchema = z.enum(["automatic", "manual"]);
export const meetingLinkTypeSchema = z.enum(["agenda", "work", "reference", "other"]);

export const publicIdSchema = z.string().regex(/^[A-Z][0-9]{3,}$/);

export const personInputSchema = z
  .object({
    name: z.string().trim().optional(),
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().default(""),
    email: z.string().trim().email().optional().or(z.literal("")),
  })
  .transform((input, context) => {
    let firstName = input.firstName ?? "";
    let lastName = input.lastName;

    if (!firstName && input.name) {
      const parsed = parsePersonName(input.name);
      if (parsed) {
        firstName = parsed.firstName;
        if (!lastName) lastName = parsed.lastName;
      }
    }

    if (!firstName) {
      context.addIssue({
        code: "custom",
        message: "First name is required",
        path: ["firstName"],
      });
      return z.NEVER;
    }

    return {
      firstName,
      lastName,
      name: formatPersonName(firstName, lastName),
      email: input.email ?? "",
    };
  });

export const personMergeInputSchema = z.object({
  targetPublicId: publicIdSchema,
});

export const taskInputSchema = z.object({
  description: z.string().trim().min(1),
  blockers: z.string().trim().default(""),
  notes: z.string().default(""),
  blockersCleared: z.boolean().default(false),
  assigneePublicId: publicIdSchema.optional().nullable(),
  status: taskStatusSchema.default("Open"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  originMeetingPublicId: publicIdSchema.optional().nullable(),
  originDecisionPublicId: publicIdSchema.optional().nullable(),
  seriesPublicId: publicIdSchema.optional().nullable(),
  reminderMode: taskReminderModeSchema.default("manual"),
  dependencyPublicIds: z.array(publicIdSchema).default([]),
  private: z.boolean().default(false),
});

export const taskUpdateInputSchema = taskInputSchema.extend({
  blockers: z.string().trim().optional(),
  notes: z.string().optional(),
  blockersCleared: z.boolean().optional(),
});

export const decisionFollowUpTaskInputSchema = z.object({
  description: z.string().trim().min(1),
  blockers: z.string().trim().default(""),
  notes: z.string().default(""),
  assigneePublicId: publicIdSchema.optional().nullable(),
  status: taskStatusSchema.default("Open"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  private: z.boolean().default(false),
});

export const meetingLinkInputSchema = z.object({
  label: z.string().trim().min(1),
  url: z.string().trim().url(),
  linkType: meetingLinkTypeSchema.default("reference"),
});

export const meetingInputSchema = z.object({
  title: z.string().trim().min(1),
  startsAt: z.string().datetime(),
  meetingType: z.enum(["single", "recurring"]),
  seriesPublicId: publicIdSchema.optional().nullable(),
  summary: z.string().trim().default(""),
  blockers: z.string().trim().default(""),
  blockersCleared: z.boolean().default(false),
  notes: z.string().default(""),
  links: z.array(meetingLinkInputSchema).default([]),
  attendeePublicIds: z.array(publicIdSchema).default([]),
  taskPublicIds: z.array(publicIdSchema).default([]),
  private: z.boolean().default(false),
});

export const meetingUpdateInputSchema = meetingInputSchema.extend({
  blockers: z.string().trim().optional(),
  blockersCleared: z.boolean().optional(),
  notes: z.string().optional(),
  links: z.array(meetingLinkInputSchema).optional(),
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
  followUpTask: decisionFollowUpTaskInputSchema.optional().nullable(),
});

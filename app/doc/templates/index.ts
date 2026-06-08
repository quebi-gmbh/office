/**
 * Built-in document templates.
 *
 * To add a new template: write it in the live editor, copy editor.getJSON()
 * from the browser console, and paste the result as a new entry here.
 */
import type { JSONContent } from "@tiptap/react";

export type DocTemplate = {
  id: string;
  name: string;
  description: string;
  title: string;
  doc: JSONContent;
};

const blank: DocTemplate = {
  id: "blank",
  name: "Blank",
  description: "An empty document",
  title: "",
  doc: { type: "doc", content: [{ type: "paragraph" }] },
};

const letter: DocTemplate = {
  id: "letter",
  name: "Letter",
  description: "A formal letter template",
  title: "Letter",
  doc: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Your Name" }] },
      { type: "paragraph", content: [{ type: "text", text: "Your Address" }] },
      { type: "paragraph", content: [{ type: "text", text: "City, State ZIP" }] },
      { type: "paragraph", content: [{ type: "text", text: "Date" }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "Recipient Name" }] },
      { type: "paragraph", content: [{ type: "text", text: "Recipient Address" }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "Dear [Name]," }] },
      { type: "paragraph", content: [{ type: "text", text: "I am writing to…" }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "Sincerely," }] },
      { type: "paragraph", content: [{ type: "text", text: "Your Name" }] },
    ],
  },
};

const meetingNotes: DocTemplate = {
  id: "meeting-notes",
  name: "Meeting Notes",
  description: "Structured notes with agenda and action items",
  title: "Meeting Notes",
  doc: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Meeting Notes" }] },
      { type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "Date:" }, { type: "text", text: " " }] },
      { type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "Attendees:" }, { type: "text", text: " " }] },
      { type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "Location:" }, { type: "text", text: " " }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Agenda" }] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item 1" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item 2" }] }] },
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Notes" }] },
      { type: "paragraph", content: [{ type: "text", text: "Discussion points and decisions…" }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Action Items" }] },
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Owner: Task description" }] }] },
          { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Owner: Task description" }] }] },
        ],
      },
    ],
  },
};

const blogPost: DocTemplate = {
  id: "blog-post",
  name: "Blog Post",
  description: "Title, intro, sections, and conclusion",
  title: "Blog Post Title",
  doc: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Your Blog Post Title" }] },
      { type: "paragraph", content: [{ type: "text", marks: [{ type: "italic" }], text: "A compelling introduction that hooks the reader…" }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "First Section" }] },
      { type: "paragraph", content: [{ type: "text", text: "Your content here…" }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Second Section" }] },
      { type: "paragraph", content: [{ type: "text", text: "More content here…" }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Conclusion" }] },
      { type: "paragraph", content: [{ type: "text", text: "Wrap up and call to action…" }] },
    ],
  },
};

const resume: DocTemplate = {
  id: "resume",
  name: "Resume",
  description: "A clean résumé / CV template",
  title: "Resume",
  doc: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Your Name" }] },
      { type: "paragraph", content: [{ type: "text", text: "email@example.com  ·  (555) 123-4567  ·  City, State" }] },
      { type: "horizontalRule" },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Summary" }] },
      { type: "paragraph", content: [{ type: "text", text: "A motivated professional with experience in…" }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Experience" }] },
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Job Title — Company Name" }] },
      { type: "paragraph", content: [{ type: "text", marks: [{ type: "italic" }], text: "Month Year – Month Year" }] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Key achievement or responsibility" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Another achievement" }] }] },
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Education" }] },
      { type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "Degree, Major" }, { type: "text", text: " — University, Year" }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Skills" }] },
      { type: "paragraph", content: [{ type: "text", text: "Skill 1, Skill 2, Skill 3, Skill 4" }] },
    ],
  },
};

export const BUILTIN_TEMPLATES: DocTemplate[] = [
  blank,
  letter,
  meetingNotes,
  blogPost,
  resume,
];

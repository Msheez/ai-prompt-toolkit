/**
 * starter-prompts.js — the optional "starter pack".
 *
 * New visitors land on an empty library, which is a poor first impression, so
 * they can load these eight prompts with one click. They are plain data and
 * can be deleted like any other prompt.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.PromptToolkit = global.PromptToolkit || {};
    global.PromptToolkit.starterPrompts = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return [
    {
      title: "YouTube video ideas",
      category: "Content",
      tags: ["youtube", "ideas", "brainstorm"],
      favorite: true,
      notes: "Good warm-up prompt when planning a new series.",
      content:
        "Give me 10 creative YouTube video ideas about {{topic|artificial intelligence}} for {{audience|complete beginners}}.\n\nFor each idea include:\n- A clickable title (max 60 characters)\n- A one-sentence hook for the first 5 seconds\n- Why this idea would perform well in 2026",
    },
    {
      title: "Explain like I'm new to this",
      category: "Learning",
      tags: ["explain", "study"],
      content:
        "Explain {{concept}} to someone who is completely new to the subject.\n\nRules:\n1. Start with a one-paragraph plain-English summary.\n2. Use one everyday analogy.\n3. Give a short, concrete example.\n4. Finish with three common misunderstandings.\n\nKeep the whole answer under {{word_limit|400}} words.",
    },
    {
      title: "Code review assistant",
      category: "Engineering",
      tags: ["code", "review", "quality"],
      favorite: true,
      content:
        "You are a senior {{language|JavaScript}} engineer reviewing a pull request.\n\nReview the code below for:\n- Correctness and edge cases\n- Readability and naming\n- Performance problems\n- Security issues\n\nFor each finding give: severity (low/medium/high), the problem, and a suggested fix as a code snippet. Be direct and skip compliments.\n\nCode:\n```\n{{code}}\n```",
    },
    {
      title: "Commit message writer",
      category: "Engineering",
      tags: ["git", "workflow"],
      content:
        "Write a Conventional Commits message for the following change.\n\nRules:\n- Subject line in the imperative mood, max 72 characters\n- Add a short body explaining the why, not the what\n- Mention breaking changes with a BREAKING CHANGE footer\n\nChange:\n{{diff_or_description}}",
    },
    {
      title: "Polite follow-up email",
      category: "Writing",
      tags: ["email", "business"],
      content:
        "Write a short follow-up email to {{recipient}} about {{subject}}.\n\nTone: {{tone|friendly and professional}}\nLength: under 120 words\nGoal: {{goal|get a reply with a decision or a date}}\n\nEnd with a single clear question.",
    },
    {
      title: "Blog post outline",
      category: "Content",
      tags: ["seo", "writing", "outline"],
      content:
        "Create an SEO-friendly outline for a blog post titled \"{{title}}\".\n\nInclude:\n- A meta description under 155 characters\n- 5 to 7 H2 sections with one-line descriptions\n- Suggested internal and external link topics\n- Three questions to answer for a FAQ section\n\nPrimary keyword: {{keyword}}",
    },
    {
      title: "Meeting notes to action items",
      category: "Productivity",
      tags: ["summary", "meetings"],
      content:
        "Turn the following meeting notes into a structured summary.\n\nOutput format:\n**Decisions** - bullet list\n**Action items** - table with owner, task, and due date\n**Open questions** - bullet list\n\nIf an owner or date is missing, write \"unassigned\" instead of guessing.\n\nNotes:\n{{notes}}",
    },
    {
      title: "Rewrite for clarity",
      category: "Writing",
      tags: ["editing", "clarity"],
      content:
        "Rewrite the text below so it is clearer and easier to read.\n\nKeep the original meaning and facts. Prefer short sentences and active voice. Target reading level: {{reading_level|a smart 15-year-old}}.\n\nReturn the rewrite first, then a short bullet list of what you changed.\n\nText:\n{{text}}",
    },
  ];
});

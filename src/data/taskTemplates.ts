import type { GoalCategory, QuestPeriod } from '../types'

type TemplateBank = Record<GoalCategory, Record<QuestPeriod, string[]>>

// {goal} is replaced with the user's goal title (lowercased at first letter where natural).
export const TASK_TEMPLATES: TemplateBank = {
  fitness: {
    daily: [
      'Complete a 20-minute workout toward "{goal}"',
      'Take a 15-minute walk or light cardio session',
      'Do 3 sets of bodyweight exercises (push-ups, squats, planks)',
      'Stretch for 10 minutes and log how your body feels',
      'Drink 8 glasses of water and track your meals for today',
      'Get 7+ hours of sleep to recover for "{goal}"',
    ],
    weekly: [
      'Complete 3 full workout sessions this week',
      'Try one new exercise or class you have not done before',
      'Track your progress: measurements, reps, or pace',
      'Plan next week\'s workout schedule in advance',
      'Do one long endurance session (run, ride, or swim)',
    ],
    monthly: [
      'Reassess your fitness goal "{goal}" and adjust your plan',
      'Hit a new personal record in any exercise',
      'Complete 12+ workout sessions this month',
      'Take progress photos or measurements to track change',
    ],
  },
  learning: {
    daily: [
      'Study "{goal}" for at least 25 focused minutes',
      'Review yesterday\'s notes for 10 minutes before starting new material',
      'Practice active recall: write down 5 things you remember',
      'Watch or read one lesson related to "{goal}"',
      'Teach one concept you learned today to someone (or write it out)',
    ],
    weekly: [
      'Complete one full module, chapter, or unit toward "{goal}"',
      'Take a practice quiz or self-test on this week\'s material',
      'Spend 2 hours in deep, distraction-free study',
      'Find and save 3 new resources (articles, videos, courses)',
    ],
    monthly: [
      'Take a milestone assessment to measure progress on "{goal}"',
      'Complete a project or exercise that applies what you learned',
      'Review your entire month of notes and summarize key takeaways',
      'Set next month\'s learning milestones for "{goal}"',
    ],
  },
  career: {
    daily: [
      'Spend 30 focused minutes advancing "{goal}"',
      'Reach out to one contact, client, or lead',
      'Update your task list and tackle the top priority item',
      'Spend 15 minutes learning something relevant to your field',
      'Reflect: write one thing that went well at work today',
    ],
    weekly: [
      'Make measurable progress on one key deliverable for "{goal}"',
      'Network: message or meet one new professional contact',
      'Review your goals and adjust priorities for next week',
      'Update your resume, portfolio, or business plan',
    ],
    monthly: [
      'Review progress on "{goal}" against your original plan',
      'Ask for feedback from a mentor, manager, or peer',
      'Set 1-3 concrete objectives for next month',
      'Celebrate a win — however small — from this month',
    ],
  },
  creative: {
    daily: [
      'Spend 20 minutes creating toward "{goal}"',
      'Sketch, freewrite, or improvise for 10 minutes with no judgment',
      'Study one piece of work from an artist/creator you admire',
      'Capture one idea or inspiration in a notebook',
    ],
    weekly: [
      'Finish one small creative piece related to "{goal}"',
      'Share your work with someone for feedback',
      'Try a new technique or tool you have not used before',
      'Spend 2 hours in an uninterrupted creative session',
    ],
    monthly: [
      'Complete a larger project milestone for "{goal}"',
      'Publish, share, or showcase something you made this month',
      'Review your body of work and pick a favorite piece',
      'Set a creative theme or focus for next month',
    ],
  },
  wellness: {
    daily: [
      'Meditate or breathe deeply for 10 minutes',
      'Write 3 things you are grateful for today',
      'Take a screen-free break for 20 minutes',
      'Check in on your mood and journal a few lines',
      'Get outside for fresh air for at least 10 minutes',
    ],
    weekly: [
      'Have one screen-free evening this week',
      'Reflect on your progress toward "{goal}" in a journal entry',
      'Try one new relaxation or mindfulness technique',
      'Reach out to someone who supports your wellbeing',
    ],
    monthly: [
      'Review how "{goal}" has affected your overall wellbeing',
      'Do a full digital detox day',
      'Revisit your stress levels and adjust your routine',
      'Plan one restorative activity for next month',
    ],
  },
  finance: {
    daily: [
      'Log every expense from today',
      'Avoid one unnecessary purchase',
      'Spend 10 minutes reviewing your budget for "{goal}"',
      'Research one way to save or earn more money',
    ],
    weekly: [
      'Review this week\'s spending against your budget',
      'Move a set amount into savings toward "{goal}"',
      'Cancel or reconsider one unused subscription',
      'Read one article or lesson about personal finance',
    ],
    monthly: [
      'Review your full budget and net progress toward "{goal}"',
      'Check your account balances and update your tracker',
      'Set a savings or debt-payoff target for next month',
      'Do a subscription and recurring-expense audit',
    ],
  },
  social: {
    daily: [
      'Reach out to one friend or family member today',
      'Give someone a genuine compliment or thank-you',
      'Have one distraction-free conversation (phone away)',
      'Do a small kind act for someone in your life',
    ],
    weekly: [
      'Plan and have one quality hangout or call',
      'Reconnect with someone you have not talked to in a while',
      'Write a thoughtful message to someone toward "{goal}"',
      'Attend or plan one social or community event',
    ],
    monthly: [
      'Reflect on your relationships and progress toward "{goal}"',
      'Plan a meaningful gathering with people who matter to you',
      'Resolve or address one lingering relationship tension',
      'Reach out to someone you have been meaning to reconnect with',
    ],
  },
  general: {
    daily: [
      'Spend 20 focused minutes working on "{goal}"',
      'Write down one small step you can take today for "{goal}"',
      'Remove one obstacle standing between you and "{goal}"',
      'Reflect for 5 minutes on why "{goal}" matters to you',
    ],
    weekly: [
      'Make visible progress on "{goal}" this week',
      'Review what is working and what is not for "{goal}"',
      'Tell someone about your goal to build accountability',
      'Plan next week\'s concrete steps toward "{goal}"',
    ],
    monthly: [
      'Do a full review of your progress on "{goal}"',
      'Adjust your plan based on what you have learned this month',
      'Celebrate progress made toward "{goal}" so far',
      'Set your top milestone for "{goal}" next month',
    ],
  },
}

export function fillTemplate(template: string, goalTitle: string): string {
  const trimmed = goalTitle.trim()
  return template.replace(/\{goal\}/g, trimmed)
}

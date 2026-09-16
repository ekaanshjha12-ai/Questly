/**
 * Quest wording for goals that have no written pool of their own.
 *
 * `{goal}` is replaced with the goal title. Moved here from the client when
 * quest generation became the server's job: the server decides which quests
 * exist and what they pay, so it also owns what they say.
 */
export const TASK_TEMPLATES = {
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

export const GOAL_CATEGORIES = Object.keys(TASK_TEMPLATES)

/**
 * Wording for players under 18, where the general wording assumes an adult
 * life: jobs and networking, bank accounts and debt, progress photos and meal
 * tracking. Categories not listed here already suit them.
 */
const TEEN_TEMPLATES = {
  fitness: {
    daily: [
      'Get moving for 20 minutes toward "{goal}"',
      'Take a 15-minute walk, bike ride or kickabout',
      'Do 3 sets of bodyweight exercises (push-ups, squats, planks)',
      'Stretch for 10 minutes after school or practice',
      'Drink water through the day and eat a proper breakfast',
      'Get 8 to 10 hours of sleep to recover for "{goal}"',
    ],
    weekly: [
      'Be active on 3 days this week',
      'Try a sport, class or activity you have not done before',
      'Log your reps, time or distance for this week',
      'Plan next week\'s training around school',
      'Do one longer session: a run, ride, swim or match',
    ],
    monthly: [
      'Look back at "{goal}" and adjust your plan',
      'Beat your own best in one exercise or skill',
      'Be active on 12 or more days this month',
      'Write down how much stronger or fitter you feel',
    ],
  },
  career: {
    daily: [
      'Spend 25 focused minutes on "{goal}"',
      'Practise one new skill for 15 minutes',
      'Update your to-do list and do the most important thing first',
      'Ask a teacher, coach or mentor one question about "{goal}"',
      'Write down one thing you did well today',
    ],
    weekly: [
      'Make visible progress on one piece of work for "{goal}"',
      'Find out about one course, job or path that interests you',
      'Review your week and set priorities for the next one',
      'Add something you made or learned to your skills list',
    ],
    monthly: [
      'Review how "{goal}" is going against your plan',
      'Ask a teacher, coach or mentor for feedback',
      'Set 1-3 concrete targets for next month',
      'Celebrate a win — however small — from this month',
    ],
  },
  finance: {
    daily: [
      'Write down anything you spent today',
      'Skip one thing you do not really need',
      'Spend 10 minutes planning your money for "{goal}"',
      'Learn one way to save money or earn a little safely',
    ],
    weekly: [
      'Check this week\'s spending against your plan',
      'Put some pocket money or earnings aside toward "{goal}"',
      'Compare prices before buying something you want',
      'Read or watch one short lesson about managing money',
    ],
    monthly: [
      'Count up your savings toward "{goal}"',
      'Set a savings target for next month',
      'Look back at what you spent money on this month',
      'Talk your savings plan through with a parent or guardian',
    ],
  },
  social: {
    daily: [
      'Message or talk to one friend or family member today',
      'Give someone a genuine compliment or thank-you',
      'Have one conversation with your phone away',
      'Do a small kind thing for someone at home or school',
    ],
    weekly: [
      'Plan a hangout, game or call with friends',
      'Reconnect with a friend you have not talked to in a while',
      'Join in with a club, team or group activity',
      'Help out at home with something you do not usually do',
    ],
    monthly: [
      'Reflect on your friendships and progress toward "{goal}"',
      'Plan something fun with your family or friends',
      'Sort out one misunderstanding with a friend or family member',
      'Try one new club, team or group',
    ],
  },
}

/** Gentler exercise from 65; everything else keeps the general wording. */
const SENIOR_TEMPLATES = {
  fitness: {
    daily: [
      'Take a 20-minute walk at a comfortable pace toward "{goal}"',
      'Do 10 minutes of gentle stretching or balance exercises',
      'Do 2 sets of chair squats or wall push-ups',
      'Drink water through the day and eat a balanced meal',
      'Get a good night\'s sleep to recover for "{goal}"',
    ],
    weekly: [
      'Be active on 3 days this week, at your own pace',
      'Try a gentle class: yoga, tai chi, swimming or a walking group',
      'Note how your strength, balance or stamina feels this week',
      'Plan next week\'s activity in advance',
      'Take one longer walk or swim at a steady pace',
    ],
    monthly: [
      'Look back at "{goal}" and adjust your plan',
      'Do a little more than last month in one activity',
      'Be active on 12 or more days this month',
      'Check in with your doctor about "{goal}" if anything aches',
    ],
  },
}

/** The wording a goal's quests are drawn from, for this category, cadence and age group. */
export function templatesFor(category, period, ageGroup = 'adult') {
  const own = ageGroup === 'teen' ? TEEN_TEMPLATES : ageGroup === 'senior' ? SENIOR_TEMPLATES : null
  return own?.[category]?.[period] ?? TASK_TEMPLATES[category]?.[period] ?? TASK_TEMPLATES.general[period]
}

// Topics that have no place in a quest for someone under 18, however the line
// was written — by the quest writer, a planner or a goal's own pool.
const NOT_FOR_TEENS =
  /\b(?:calories?|calorie[\s-]counting|diet(?:s|ing)?|fasting|weight[\s-]?loss|lose\s+\d+\s*(?:kg|kilos?|lbs?|pounds)|body[\s-]?fat|progress\s+photos?|alcohol|beer|wine|vodka|nightclubs?|pubs?|casinos?|gambl\w*|betting|crypto\w*|bitcoin|forex|day[\s-]?trading|stock\s+market|credit\s+cards?|loans?|mortgages?|debt|dating|tinder|meet\s+(?:up\s+with\s+)?strangers|all[\s-]?nighters?)\b/i

/** Whether a line of quest wording suits a player of this age group. */
export function suitableForAge(text, ageGroup) {
  return ageGroup !== 'teen' || !NOT_FOR_TEENS.test(String(text ?? ''))
}

export function fillTemplate(template, goalTitle) {
  return template.replace(/\{goal\}/g, String(goalTitle ?? '').trim())
}

function hashString(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

/** mulberry32: the same seed always gives the same sequence. */
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle(items, seed) {
  const rand = mulberry32(hashString(seed))
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

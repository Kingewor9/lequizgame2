export interface CareerMilestone {
  title: string;
  points: number;
}

export const CAREER_MILESTONES: CareerMilestone[] = [
  { title: 'Rookie', points: 1_000 },
  { title: 'Prospect', points: 5_000 },
  { title: 'Academy Graduate', points: 10_000 },
  { title: 'First Team', points: 50_000 },
  { title: 'Playmaker', points: 100_000 },
  { title: 'Worldclass', points: 250_000 },
  { title: 'Hall of Famer', points: 500_000 },
  { title: 'Legend', points: 1_000_000 },
];

export interface MilestoneNotification {
  id: string;
  title: string;
  points: number;
}

export const getCurrentMilestone = (points: number): CareerMilestone | null => {
  return [...CAREER_MILESTONES].reverse().find((milestone) => points >= milestone.points) || null;
};

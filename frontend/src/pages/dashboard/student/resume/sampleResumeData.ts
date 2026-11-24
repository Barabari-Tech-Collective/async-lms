import type { ResumeDocument } from './types';

export const SAMPLE_RESUME_DOC: ResumeDocument = {
  schemaVersion: 1,
  category: 'general',
  targetRole: 'Full Stack Developer',
  templateId: 'ivy-standard',
  personalInfo: {
    fullName: 'Alex Chen',
    headline: 'Full Stack Developer & Cloud Engineer',
    email: 'alex.chen@example.com',
    phone: '+91 98765 43210',
    location: 'Hyderabad, India',
    avatarUrl: '',
    links: [
      { label: 'LinkedIn', url: 'https://linkedin.com/in/alexchen' },
      { label: 'GitHub', url: 'https://github.com/alexchen' },
      { label: 'Portfolio', url: 'https://alexchen.dev' },
    ],
  },
  summary:
    'Dedicated Full Stack Developer with hands-on experience building scalable web applications and RESTful APIs using React, Node.js, and PostgreSQL. Proven ability to architect modular microservices, optimize database queries by 40%, and deliver production-ready software in agile teams.',
  skills: {
    languages: ['JavaScript', 'TypeScript', 'Python', 'SQL'],
    frameworks: ['React', 'Node.js', 'Express', 'Next.js', 'Tailwind CSS'],
    databases: ['PostgreSQL', 'MongoDB', 'Redis'],
    tools: ['Docker', 'AWS', 'Git', 'Linux', 'Jest', 'Postman'],
  },
  projects: [
    {
      id: 'p1',
      title: 'CodeGuru Learning Management System',
      description:
        'Engineered an asynchronous learning platform featuring automated coding evaluation and real-time student analytics.',
      techStack: ['React', 'Node.js', 'Express', 'PostgreSQL', 'Tailwind CSS'],
      bullets: [
        'Implemented JWT authentication and role-based access control for 1,200+ active learners.',
        'Reduced page load times by 35% through Vite code-splitting and Redis caching layer.',
        'Built automated code execution pipeline with Docker container sandboxing.',
      ],
      repositoryUrl: 'https://github.com/alexchen/async-lms',
      liveDemoUrl: 'https://codeguru.example.com',
      verificationStatus: 'SELF_REPORTED',
    },
    {
      id: 'p2',
      title: 'Real-Time Collaborative Code Editor',
      description:
        'Built an in-browser multiplayer code editor with operational transformation and sandboxed execution.',
      techStack: ['TypeScript', 'WebSocket', 'Monaco Editor', 'Docker'],
      bullets: [
        'Integrated Monaco Editor with syntax highlighting and code completion for 12 languages.',
        'Handled 500+ concurrent WebSocket connections with sub-50ms message round-trip latency.',
      ],
      repositoryUrl: 'https://github.com/alexchen/collab-editor',
      liveDemoUrl: 'https://collab.example.com',
      verificationStatus: 'SELF_REPORTED',
    },
    {
      id: 'p3',
      title: 'Cloud Telemetry & Health Dashboard',
      description:
        'Developed a high-throughput time-series telemetry aggregator for microservice health tracking.',
      techStack: ['Python', 'FastAPI', 'TimescaleDB', 'Docker', 'AWS'],
      bullets: [
        'Automated CI/CD deployment pipelines using GitHub Actions and AWS ECS.',
        'Created real-time alerting system reducing incident response time by 45%.',
      ],
      repositoryUrl: 'https://github.com/alexchen/metrics-dashboard',
      verificationStatus: 'SELF_REPORTED',
    },
  ],
  experience: [
    {
      id: 'e1',
      role: 'Software Engineering Intern',
      organization: 'Barabari Tech Collective',
      location: 'Hyderabad, India',
      startDate: 'Jan 2026',
      endDate: 'Present',
      current: true,
      bullets: [
        'Contributed to core educational LMS platform, building accessible and responsive UI components.',
        'Optimized PostgreSQL queries and normalized schema structures, improving query response by 30%.',
      ],
    },
  ],
  education: [
    {
      id: 'ed1',
      degree: 'B.Tech in Computer Science & Engineering',
      institution: 'Government City College / Osmania University',
      startYear: '2022',
      endYear: '2026',
      score: '8.8 CGPA',
      gradingSystem: 'CGPA_10',
      fieldOfStudy: 'Computer Science',
    },
  ],
  certifications: [
    {
      id: 'c1',
      title: 'AWS Certified Cloud Practitioner',
      issuer: 'Amazon Web Services',
      issueDate: '2025',
      verificationStatus: 'SELF_REPORTED',
    },
    {
      id: 'c2',
      title: 'Full Stack Placement Verified Graduate',
      issuer: 'Barabari CodeGuru',
      issueDate: '2026',
      verificationStatus: 'SELF_REPORTED',
    },
  ],
};

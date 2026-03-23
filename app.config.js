import 'dotenv/config';

export default ({ config }) => {
  return {
    ...config,
    ios: {
      ...config.ios,
      appleTeamId: process.env.APPLE_TEAM_ID,
    },
  };
};

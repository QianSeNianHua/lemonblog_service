import { EggAppConfig, PowerPartial } from 'egg';

export default () => {
  const config: PowerPartial<EggAppConfig> = {};

  config.security = {
    // 安全防范
    csrf: {
      enable: false,
    },
  };

  // mariadb
  config.sequelize = {
    host: '127.0.0.1',
    port: 3306,
    username: 'root',
    password: 'root'
  };

  return config;
};

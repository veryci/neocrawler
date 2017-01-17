const redis = require('../webconfig/lib/redis');
exports.load = (settings) => {
  global.settings = settings;
  const instance = settings.instance;
  const rules = require(`../instance/${instance}/rules`);
  const keys = Object.keys(rules);
  keys.forEach((key) => {
    const jsonobj = rules[key];
    jsonobj.instance = instance;
    redis.drillerInfoRedis.set(`driller:${instance}:${jsonobj.domain}:${jsonobj.alias}`, JSON.stringify(jsonobj));
  });
};

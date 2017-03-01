const redis = require('../webconfig/lib/redis');

const base = {
  "id_parameter": [],
  "encoding": "auto",
  "type": "node",
  "save_page": false,
  "format": "html",
  "jshandle": false,
  "extract_rule": {},
  "cookie": [],
  "inject_jquery": false,
  "load_img": false,
  "drill_rules": [],
  "drill_relation": {
    "base": "content",
    "mode": "css",
    "expression": "title",
    "pick": "text",
    "index": 1
  },
  "validation_keywords": [],
  "script": [],
  "navigate_rule": [],
  "stoppage": -1,
  "priority": 5,
  "weight": 10,
  "schedule_interval": 86400,
  "active": true,
  "seed": [],
  "schedule_rule": "FIFO",
  "use_proxy": false
}


exports.load = (settings) => {
  global.settings = settings;
  const instance = settings.instance;
  const rules = require(`../instance/${instance}/rules`);
  const keys = Object.keys(rules);
  keys.forEach((key) => {
    const _instance = rules[key];
    const jsonobj = Object.assign({}, base, _instance);
    jsonobj.instance = instance;
    if(jsonobj.type === 'node'){
      const rules = jsonobj.extract_rule.rule;
      if(!rules.title){
        rules.title = {
          "base": "content",
          "mode": "css",
          "expression": "title",
          "pick": "text",
          "index": 1
        };
      }
      rules.keywords = {
        "base": "content",
        "mode": "css",
        "expression": "meta[name=keywords]",
        "pick": "@content",
        "index": 1
      };
      rules.description = {
        "base": "content",
        "mode": "css",
        "expression": "meta[name=description]",
        "pick": "@content",
        "index": 1
      };
      const _html = rules.html;
      if(_html && !rules.content){
        rules.content = Object.assign({}, _html);
        rules.content.pick = 'text';
      }
      if(_html && !rules.pic){
        rules.pic = Object.assign({}, _html);
        rules.pic.expression = _html.expression + ' img';
        rules.pic.pick = '@src';
        rules.pic.index = -1;
      }
    }
    const name = `driller:${instance}:${jsonobj.domain}:${jsonobj.alias}`;
    redis.drillerInfoRedis.set(name, JSON.stringify(jsonobj));
  });
};

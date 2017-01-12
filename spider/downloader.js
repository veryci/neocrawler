/**
 * Created by james on 13-11-22.
 * download middleware
 */
var util = require('util');
var urlUtil =  require("url");
var redis = require("redis");
var events = require('events');
var child_process = require('child_process');
var path = require('path');
var http = require('http');
require('../lib/jsextend.js');
var iconv = require('iconv-lite');
var BufferHelper = require('bufferhelper');
try { var unzip = require('zlib').unzip } catch(e) { /* unzip not supported */ }
var logger;

//command signal defined
var CMD_SIGNAL_CRAWL_SUCCESS = 1;
var CMD_SIGNAL_CRAWL_FAIL = 3;
var CMD_SIGNAL_NAVIGATE_EXCEPTION = 2;

var downloader = function (spiderCore) {
  events.EventEmitter.call(this);//eventemitter inherits
  this.spiderCore = spiderCore;
  this.proxyList = [];
  this.timeout_count = 0;
  logger = spiderCore.settings.logger;
}

util.inherits(downloader, events.EventEmitter);//eventemitter inherits

////report to spidercore standby////////////////////////
downloader.prototype.assembly = function(callback){
    /*
    var downloader = this;
    var MIN_PROXY_LENGTH = 1000;
    downloader.on('gotProxyList',function(label,proxylist){
        if(proxylist&&proxylist.length>0)downloader.tmp_proxyList = downloader.tmp_proxyList.concat(proxylist);
        switch(label){
            case 'proxy:vip:available:1s':
                if(downloader.tmp_proxyList.length<MIN_PROXY_LENGTH)this.getProxyListFromDb('proxy:vip:available:3s');
                else {
                    downloader.proxyList = downloader.tmp_proxyList;
                    downloader.emit('refreshed_proxy_list',downloader.proxyList);
                }
                break;
            case 'proxy:vip:available:3s':
                if(downloader.tmp_proxyList.length<MIN_PROXY_LENGTH)this.getProxyListFromDb('proxy:public:available:1s');
                else {
                    downloader.proxyList = downloader.tmp_proxyList;
                    downloader.emit('refreshed_proxy_list',downloader.proxyList);
                }
                break;
            case 'proxy:public:available:1s':
                if(downloader.tmp_proxyList.length<MIN_PROXY_LENGTH)this.getProxyListFromDb('proxy:public:available:3s');
                else {
                    downloader.proxyList = downloader.tmp_proxyList;
                    downloader.emit('refreshed_proxy_list',downloader.proxyList);
                }
                break;
            case 'proxy:public:available:3s':
                if(downloader.tmp_proxyList.length<MIN_PROXY_LENGTH)logger.warn(util.format('Only %d proxies !!!',downloader.tmp_proxyList.length));
                if(downloader.tmp_proxyList.length<0)throw new Error('no proxy list');
                else{
                    downloader.proxyList = downloader.tmp_proxyList;
                    downloader.emit('refreshed_proxy_list',downloader.proxyList);
                }
                break;
        }
    });
    this.redis_cli3 = redis.createClient(this.spiderCore.settings['proxy_info_redis_db'][1],this.spiderCore.settings['proxy_info_redis_db'][0]);
    if(this.spiderCore.settings['use_proxy']){
        downloader.redis_cli3.select(downloader.spiderCore.settings['proxy_info_redis_db'][2], function(err,value) {
             if(err)throw(err);
             downloader.refreshProxyList(downloader);
             downloader.on('refreshed_proxy_list',function(proxylist){
                 downloader.spiderCore.emit('standby','downloader');
                 setTimeout(function(){downloader.refreshProxyList(downloader)},10*60*1000);//refresh again after 10 mins
             });
         });

    }else{
        this.spiderCore.emit('standby','downloader');
    }
    */
    if(callback)callback(null,'done');
}
/**
 * refresh proxy list from redis db
 * @param downloader
 */
downloader.prototype.refreshProxyList = function(downloader){
    downloader.tmp_proxyList = [];
    downloader.getProxyListFromDb('proxy:vip:available:1s');
}

/**
 * get proxy list from redisdb, emit event
 * @param label
 */
downloader.prototype.getProxyListFromDb = function(label){
    var downloader = this;
    logger.debug(util.format('get proxy list from :%s',label));
    downloader.redis_cli3.lrange(label,0,-1,function(err,proxylist){
        if(err)throw(err);
        downloader.emit('gotProxyList',label,proxylist);
    });
}

////download action/////////////////////
downloader.prototype.download = function (urlinfo){
  if (urlinfo['jshandle']) {
    this.browseIt(urlinfo);
  } else {
    this.downloadIt(urlinfo);
  }
};

downloader.prototype.transCookieKvPair = function(json){
    var kvarray = [];
    for(var i=0; i<json.length; i++){
        kvarray.push(json[i]['name']+'='+json[i]['value']);
    }
    return kvarray.join(';');
}

/**
 * download page action use http request
 */
downloader.prototype.downloadItAct = function(urlinfo){
    var spiderCore = this.spiderCore;
    var self = this;

    var timeOuter = false;
    var pageLink = urlinfo['url'];
    if(urlinfo['redirect'])pageLink = urlinfo['redirect'];

    var useProxy = false;
    if(urlinfo['urllib']&&spiderCore.settings['use_proxy']===true){
        if(spiderCore.spider.getDrillerRule(urlinfo['urllib'],'use_proxy')===true)useProxy=true;
    }

    var urlobj = urlUtil.parse(pageLink);
    if(useProxy){
        var proxyRouter = spiderCore.settings['proxy_router'].split(':');
        var __host = proxyRouter[0];
        var __port = proxyRouter[1];
        var __path =  pageLink;
    }else{
        var __host = urlobj['hostname'];
        var __port = urlobj['port'];
        var __path = urlobj['path'];
//        var __path = pageLink;
    }


    var startTime = new Date();
    var options = {
        'host': __host,
        'port': __port,
        'path': __path,
        'method': 'GET',
        'headers': {
            "User-Agent":"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like NeoCrawler) Chrome/31.0.1650.57 Safari/537.36",
            "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Encoding":"gzip",
            "Accept-Language":"zh-CN,zh;q=0.8,en-US;q=0.6,en;q=0.4",
            "Referer":urlinfo['referer']||'',
            "host": urlobj['host'],
            "void-proxy":urlinfo['void_proxy']?urlinfo['void_proxy']:"",
            "Cookie":this.transCookieKvPair(urlinfo['cookie'])
        }
    };
    logger.debug(util.format('Request start, %s',pageLink));
    var req = http.request(options, function(res) {
        logger.debug(util.format('Response, %s',pageLink));

        var result = {
            "remote_proxy":res.headers['remoteproxy'],
            "drill_count":0,
            "cookie":res.headers['Cookie'],
            "url":urlinfo['url'],
            //"url":res.req.path,
            //"statusCode":res.statusCode,
            "origin":urlinfo
        };
        if(result['url'].startsWith('/'))result['url'] = urlUtil.resolve(pageLink,result['url']);
        result['statusCode'] = res.statusCode;
        if(parseInt(res.statusCode)==301||parseInt(res.statusCode)==302){
            if(res.headers['location']){
                result['origin']['redirect'] = urlUtil.resolve(pageLink,res.headers['location']);
                logger.debug(pageLink+' 301 Moved Permanently to '+res.headers['location']);
            }
        }

        var compressed = /gzip|deflate/.test(res.headers['content-encoding']);

        var bufferHelper = new BufferHelper();
//        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            bufferHelper.concat(chunk);
        });

        res.on('end', function (chunk) {
            self.timeout_count--;
            if(timeOuter){
                clearTimeout(timeOuter);
                timeOuter = false;
            }
            result["cost"] = (new Date()) - startTime;
            logger.debug('download '+pageLink+', cost:'+result["cost"]+'ms');


            var page_encoding = urlinfo['encoding'];

            if(page_encoding==='auto'){
                page_encoding = self.get_page_encoding(res.headers);
            }

            page_encoding = page_encoding.toLowerCase().replace('\-','')
            if(!compressed || typeof unzip == 'undefined'){
                if(urlinfo['format']=='binary'){
                    result["content"] = bufferHelper.toBuffer();
                }else{
                    result["content"] = iconv.decode(bufferHelper.toBuffer(),page_encoding);//page_encoding
                }
                spiderCore.emit('crawled',result);
            }else{
                unzip(bufferHelper.toBuffer(), function(err, buff) {
                    if (!err && buff) {
                        if(urlinfo['format']=='binary'){
                            result["content"] = buff;
                        }else{
                            result["content"] = iconv.decode(buff,page_encoding);
                        }
                        spiderCore.emit('crawled',result);
                    }else{
                        spiderCore.emit('crawling_failure',urlinfo,'unzip failure');
                    }
                });
            }
        });
    });

    timeOuter = setTimeout(function(){
        if(req){
            logger.error('Cost '+((new Date())-startTime)+'ms download timeout, '+pageLink);
            req.abort();
            req=null;
            spiderCore.emit('crawling_failure',urlinfo,'download timeout');
            if(self.timeout_count++>spiderCore.settings['spider_concurrency']){logger.fatal('too much timeout, exit.');process.exit(1);}
        }
    },spiderCore.settings['download_timeout']*1000);

    req.on('error', function(e) {
        logger.error('problem with request: ' + e.message+', url:'+pageLink);
        if(timeOuter){
            clearTimeout(timeOuter);
            timeOuter = false;
        }
        if(req){
            req.abort();
            req = null;
            spiderCore.emit('crawling_failure',urlinfo,e.message);
        }
    });
    req.end();
}
/**
 * get page encoding
 * @returns {string}
 */
downloader.prototype.get_page_encoding = function(header){
    var page_encoding = 'UTF-8';
    //get the encoding from header
    if(header['content-type']!=undefined){
        var contentType = header['content-type'];
        var patt = new RegExp("^.*?charset\=(.+)$","ig");
        var mts = patt.exec(contentType);
        if (mts != null)
        {
            page_encoding = mts[1];
        }
    }
    return page_encoding;
}

/**
 * just download html stream
 * @param urlinfo
 */
downloader.prototype.downloadIt = function(urlinfo){
    var spiderCore = this.spiderCore;
    var self = this;
    if('download' in spiderCore.spider_extend){
        spiderCore.spider_extend.download(urlinfo,function(err,result){
            if(err==null&&result==null){
                self.downloadItAct(urlinfo);//if all return null, download it use http request
            }else{
                if(err){
                    spiderCore.emit('crawling_failure',urlinfo,err);
                }else {
                    spiderCore.emit('crawled',result);
                }
            }
        });
    }else self.downloadItAct(urlinfo);
}
/**
 * browser simulated, use phantomjs
 * @param urlinfo
 */
downloader.prototype.browseIt = function(urlinfo){
    var spiderCore = this.spiderCore;
  var phantom = require('phantom');

  let pInstance;
  let pPage;
  const result = {
    "drill_count": 0,
    "cookie": [],
    "url": urlinfo["url"],
    "statusCode": 0,
    "origin": urlinfo,
    "cost": 0,
    "content": ''
  };
  const start = Date.now();
  phantom.create(['--disk-cache=true','--ignore-ssl-errors=true', '--load-images=true','--web-security=true']).then(instance => {
    pInstance = instance;
    return instance.createPage();
  }).then(page => {
    pPage = page;
    page.on('onResourceReceived', function (response) {
      if (response.stage !== "end" || response.url != urlinfo["url"]) return;
      result["statusCode"] = response.status;
    });
    page.on('onResourceTimeout', function (request) {
      logger.error(request);
      logger.error('Cost ' + Date.now() - start + 'ms browser timeout, ' + urlinfo['url']);
      spiderCore.emit('crawling_failure', urlinfo, 'browser timeout');
      page.close();
      pInstance.exit();
    });
    page.on('onResourceError', function (resourceError) {
      logger.error(urlinfo["url"] + ' resource load fail');
      logger.info('Unable to load resource (#' + resourceError.id + 'URL:' + resourceError.url + ')');
      logger.info('Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString);
      // spiderCore.emit('crawling_failure', urlinfo, 'phantomjs unknown failure');
      // page.close();
      // pInstance.exit();
    });
    page.on('onError', function (msg, trace) {
      var msgStack = ['ERROR: ' + msg];
      if (trace && trace.length) {
        msgStack.push('TRACE:');
        trace.forEach(function (t) {
          msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function + '")' : ''));
        });
      }
      logger.error(msgStack.join('\n'));
      // page.close();
      // pInstance.exit();
    });
    return page.open(urlinfo['url'], {resourceTimeout: spiderCore.settings['download_timeout'] * 1000})
  }).then(function (status) {
    if (status == 'suceess') {
      result["statusCode"] = 200;
    }
    result["cost"] = Date.now() - start;
    return Promise.all([pPage.property('content'), pPage.property('cookies')]);
  }).then(function ([content, cookies]) {
    result["content"] = content;
    result["cookies"] = cookies;
    result["page"] = pPage;
    result["phantom"] = pInstance;
    spiderCore.emit('crawled', result);
  }).catch(error => {
    logger.error('phantomjs stderr: ' + error);
    pInstance.exit();
  });
};
////////////////////////////////////////
module.exports = downloader;

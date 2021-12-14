var reGroups = [/业主/];
var reSeparator = /[ _.— －ㄧ– ― −-]/i;
var reBuildingSuffix = new RegExp("\\s*[🏡=DF栋拣棟幢吨阁閣座～，。~、＃#+*＊" + reSeparator.source.substr(1, reSeparator.source.length - 2) + "]+\\s*", "i");
var reFloorSuffix = new RegExp('\\s*[楼' + reSeparator.source.substr(1, reSeparator.source.length - 2) + ']+\\s*', "i");
// console.error(reBuildingSuffix.source);
// console.error(reFloorSuffix.source);
var resProperty = [
  new RegExp("([1-9]|10|[0-9][1-9])" + reBuildingSuffix.source + "(\\d\\d?)\\s*(\\d\\d)", "i"),
  new RegExp("([1-9]|10|[0-9][1-9])" + reBuildingSuffix.source + "(\\d\\d?)" + reFloorSuffix.source + "(\\d\\d?)", "i"),
  /(0?[1-9])\s*(0[1-9]|[12]\d|3[12])\s*(0[1-4])/,
  /(1[01])\s*(0[1-9]|1\d|20)\s*(0[1-9]|1\d|2[0-7])/,
];

﻿const app = { data: { '好': '大家好才是真的好' } }
    , WebSocketClient = require('./websocket')
    , client = new WebSocketClient()
    , fs = require('fs')
function init() {
    let args = process.argv, reg
    for (let i in args) if (reg = /^--(.+)$/.exec(args[i])) app[reg[1]] = args[++i]
    console.log('应用信息', app)
    if (!app.key) return console.error('key无效')

    try {
        if (fs.existsSync('keys.ini')) {
            let d = fs.readFileSync('keys.ini')
            app.data = JSON.parse(d)
        }
    } catch (error) {
        console.error(error)
    }

    RunApp()
}
function SaveConfig() {
    fs.writeFile('keys.ini', JSON.stringify(app.data), function () { })
}
init()

function parseProperty(txt) {
	let m = firstMatch(resProperty, txt);
	if (m) {
		return [m[1] * 1, m[2] * 1, m[3] * 1];
	}
}
function firstMatch(regexps, text) {
  for (let regexp of regexps) {
    var result = regexp.exec(text);
    if (result) return result;
  }
}
//console.error(firstMatch(resProperty, "9＃-1403"));

function *items(obj) {
  for (let key in obj) {
    yield Object.freeze([key, obj[key]]);
  }
}
async function listByBuilding(obj) {
	let msg = obj.data.msg;
  let fromWxid = obj.data.fromid;
  let countPropertyByBuilding = {};
  var replies = [];
  let wxids = { "length": 0 };
  let properties = { "length": 0 };
	for (let group of (await Send({ method: 'getGroup' })).data) {
    if (group.wxid != fromWxid && !firstMatch(reGroups, group.name)) {
      continue;
    }

  	let members = (await Send({ method: 'getGroupUser', wxid: group.wxid })).data;
    replies.push(`${group.name} ${members.length} 人`);
    var property;
  	for (let member of members) {
      if (!member.nickName2) continue;
  		if (!(property = parseProperty(member.nickName2))) {
        console.error(`${group.name} ${member.nickName2}`);
  			continue;
  		}
      if (wxids[member.wxid]) continue;
      wxids[member.wxid] = true;
      wxids.length++;
      if (properties[property]) continue;
      properties[property] = true;
      properties.length++;

      let building = property[0];
      if (!countPropertyByBuilding[building]) {
        countPropertyByBuilding[building] = 0;
      }
      countPropertyByBuilding[building]++;
  	}
  }
  replies.sort();
  replies.push(`合计 ${wxids.length} 人`);
  let list = Array.from((function*() {
    for (let [building, count] of items(countPropertyByBuilding)) {
        yield `${building}栋${count}户`;
    }
  })());
  replies.push(list.join(" "));
  replies.push(`合计 ${properties.length} 户`);
  let reply = replies.join("\n");
  await Send({ method: 'sendText', wxid: fromWxid, msg: reply });
}
async function TextMessage(obj) {
  let msg = obj.data.msg, r
  if (msg == '帮助') {
    await Send({ method: 'sendText', wxid: obj.data.fromid, msg: "支持命令：统计" })
  }
  else if (msg == "统计") {
    await listByBuilding(obj);
  }
}
async function onRequest(obj) {
    //收到请求
    //返回应用数据
    return { data: app.data }
}
async function onMessage(obj) {
    console.log('收到消息', obj)
    //处理收到消息的
    if (!obj.data) return console.log('不是消息')
    if (obj.data.fromid == obj.myid) {
        //收到自己的消息,来源id换一下
        obj.data.fromid = obj.data.toid
    }
    if (obj.type == 1) {
        //文本消息
        return TextMessage(obj)
    }
}
async function sayHello() {
    let h = await Send({ method: 'sendText', wxid: 'filehelper', msg: '请发送帮助来了解如何使用我' })
    console.log('发送结果:' + JSON.stringify(h))
}
function RunApp() {
    const url = `ws://127.0.0.1:8202/wx?name=${encodeURIComponent(app.name)}&key=${app.key}`
    console.error('连接地址', url)
    client.on('connectFailed', function (error) {
        console.error('Connect Error: ' + error.toString());
    });
    client.on('connect', function (connection) {
        console.log('已连接');
        connection.on('error', function (error) {
            console.error("Connection Error: " + error.toString());
        });
        connection.on('close', function () {
            //前往应用中心查看应用
            //应用不存在或信息不正确者或正在运行中[2]或者已停止[4]都会被取消
            console.error(`被服务端取消了,可能是密钥或者应用状态不对`);
        });
        connection.on('message', async function (message) {
            if (message.type === 'utf8') {
                try {
                    let obj = JSON.parse(message.utf8Data)
                    if (obj.req !== undefined) return msgObj.cb(obj)
                    if (obj.cb !== undefined) {
                        //cb是服务端请求过来的需要回复,人家等着呢
                        let cbid = obj.cb, method = obj.method
                        obj = await onRequest(obj)
                        obj.cb = cbid
                        return connection.sendUTF(JSON.stringify(obj))
                    }
                    onMessage(obj)
                } catch (error) {
                    console.error("喵了个咪: '" + error.message + "'");
                }
            }
        });
        global.Send = function (obj, timeout) {
            if (connection.connected) {
                return new Promise((resolve, reject) => {
                    if (!obj || !obj.method) return resolve({ method: 'err', msg: 'invalid method' })
                    obj.req = msgObj.add(resolve, timeout)
                    var str = JSON.stringify(obj)
                    console.log('发送消息:' + str)
                    connection.sendUTF(str);
                }).catch(err => console.error('error:' + err))
            }
            return { msg: '未连接' }
        }
        sayHello()
    })
    client.connect(url)
}

const msgObj = {
    _id: 0
    , get id() { return msgObj._id > 60000 ? 0 : msgObj._id++ }
    , callback: {}
    , cb: function (obj) {
        if (!msgObj.callback[obj.req]) return
        clearTimeout(msgObj.callback[obj.req].timeout)
        msgObj.callback[obj.req].cb.call(null, obj)
        delete msgObj.callback[obj.req]
    }
    , event: console.log
    , req: console.log
    , add: function (cb, timeout) {
        let id = msgObj.id
        this.callback[id] = {
            cb,
            timeout: setTimeout(function () {
                msgObj.cb({ id, method: 'err', msg: 'timeout' })
            }, timeout || 3000)
        }
        return id
    }
}

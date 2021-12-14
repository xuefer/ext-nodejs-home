const app = { data: { '好': '大家好才是真的好' } }
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

var reSeparator = /[ _.— －ㄧ– ― −-]/i;
var reBuildingSuffix = new RegExp("\\s*[🏡=DF栋拣棟幢吨阁閣座～，。~、＃#+*＊" + reSeparator.source.substr(1, reSeparator.length - 2) + "]\\s*", "i");
var reProperty = new RegExp("(1[01]|0?[1-9])" + reBuildingSuffix.source + "(\\d\\d?)\\s*(\\d\\d)", "i");
console.error(reProperty.source);
function parseProperty(txt) {
	let m = reProperty.exec(txt);
	if (m) {
		return [m[1], m[2], m[3]];
	}
}
async function listByBuilding(obj, dedup) {
	let msg = obj.data.msg;
	let members = (await Send({ method: 'getGroupUser', wxid: obj.data.fromid })).data;
  let byBuilding = {};
  if (dedup) {
    dedup = {};
  }
	for (let member of members) {
		let property = parseProperty(member.nickName2);
		if (!property) {
			continue;
		}
    if (dedup) {
      if (dedup[property]) {
        continue;
      }
      dedup[property] = true;
    }

    let building = property[0];
    if (!byBuilding[building]) {
      byBuilding[building] = [];
    }
    byBuilding[building].push(member);
	}
  let list = Array.from((function*() {
    for (let building in byBuilding) {
        yield `${building}栋:${byBuilding[building].length}`;
    }
  })());
  let reply = list.join(" ");
  await Send({ method: 'sendText', wxid: obj.data.fromid, msg: reply });
}
async function TextMessage(obj) {
    let msg = obj.data.msg, r
    if (msg == '帮助') {
        r = await Send({ method: 'sendText', wxid: obj.data.fromid, msg: "支持命令：户数，人数" })
    }
    else if (msg == "户数") {
	await listByBuilding(obj, true);
    }
    else if (msg == "人数") {
	await listByBuilding(obj, false);
    }
    console.log('文本处理结果', r)
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

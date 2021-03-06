var reg = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/;
var LOGIN_ERROR = "There is no server to log in, please wait.";
var LENGTH_ERROR = "Name/Channel is too long or too short. 20 character max.";
var NAME_ERROR = "Bad character in Name/Channel. Can only have letters, numbers, Chinese characters, and '_'";
var DUPLICATE_ERROR = "Please change your name to login.";
var MSG_ERROR = "Message is empty!";

var util = {
	urlRE: /https?:\/\/([-\w\.]+)+(:\d+)?(\/([^\s]*(\?\S+)?)?)?/g,
	//  html sanitizer
	toStaticHTML: function(inputHtml) {
		inputHtml = inputHtml.toString();
		return inputHtml.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	},
	//pads n with zeros on the left,
	//digits is minimum length of output
	//zeroPad(3, 5); returns "005"
	//zeroPad(2, 500); returns "500"
	zeroPad: function(digits, n) {
		n = n.toString();
		while(n.length < digits)
		n = '0' + n;
		return n;
	},
	//it is almost 8 o'clock PM here
	//timeString(new Date); returns "19:49"
	timeString: function(date) {
		var minutes = date.getMinutes().toString();
		var hours = date.getHours().toString();
		return this.zeroPad(2, hours) + ":" + this.zeroPad(2, minutes);
	},

	//does the argument only contain whitespace?
	isBlank: function(text) {
		var blank = /^\s*$/;
		return(text.match(blank) !== null);
	}
};

var ListView = require('UserListView');

cc.Class({
    extends: cc.Component,

    properties: {

        serverIP: "127.0.0.1",
        serverPort: "3014",
        userName: "Guest2",
        roomName: "MyRoom1",

        scrollViewMsg: cc.ScrollView,
        edtMsg: cc.EditBox,
        msgLabel: cc.Label,

        userListView: {
            default: null,
            type: ListView,
        },
        targetLabel: cc.Label,
        isShowUser: 0,
    },

    // use this for initialization
    onLoad: function () {
        var self = this;

        self.initPomelo();

        self.connectServer();

        this.isShowUser  = false;
        this.scheduleOnce(this.scrollDown, 0);
    },

    initPomelo: function() {
        var self = this;

        // wait message from the server.
        pomelo.on('onChat', function(data) {
            self.addMessage(data.from, data.target, data.msg);
        });

        // updata user list
        pomelo.on('onAdd', function(data) {
            var user = data.user;
            self.tip('online', user);
            self.addUser(user);
        });

        // update user info
        pomelo.on('onLeave', function(data) {
            var user = data.user;
            self.tip('offline', user);
            self.removeUser(user);
        });

        // handle disconnect message, occours when the client is disconnect with servers
        pomelo.on('disconnect', function(reason) {
            cc.log("pomelo.on(disconnect): ", reason);
            //self.showLogin();
        });

        pomelo.on('io-error', function(data) {
            cc.log("pomelo.on(io-error): ", data);
            self.showError("error to connect");
        });
    },

    connectServer: function() {
        var self = this;

        // query entry of server
        self.queryEntry(self.userName, function(host, port) {
            pomelo.init({
                host: host,
                port: port,
                log: true
            }, function() {
                var route = "connector.entryHandler.enter";
                pomelo.request(route, {
                    username: self.userName,
                    rid: self.roomName
                }, function(data) {
                    cc.log("ChatClient.connectServer: pomelo.request return data: " +data);
                    if (data.error) {
                        self.showError(DUPLICATE_ERROR);
                        retrn;
                    }

                    self.showChat();
                    self.initUserList(data);
                });
            });
        });
    },

    // called every frame, uncomment this function to activate update callback
    // update: function (dt) {

    // },

    queryEntry: function(uid, callback) {
        var self = this;

        var route = "gate.gateHandler.queryEntry";
        pomelo.init({
            host: self.serverIP,
            port: self.serverPort,
            log: true
        }, function() {
            pomelo.request(route, {
                uid: uid
            }, function(data) {
                cc.log("pomelo.request return data: ", data);

                pomelo.disconnect();
                if (data.code === 500) {
                    self.showError(LOGIN_ERROR);
                    return;
                }

                callback(data.host, data.port);
            });
        });
    },

    showChat: function() {
        this.userListView.setChat(this);
        this.userListView.hide();
        this.scrollDown();
    },

    // add message on board
    addMessage: function(from, target, text, time) {
        cc.log("chat.addMessage() is called.");

        var name = (target == '*' ? 'all' : target);
        if (text === null) {
            return;
        }
        if (time == null) {
            // if the time is null or undefined, use the current time.
            time = new Date();
        } else if ((time instanceof Date) === false) {
            // if it is a timestamp, interpret it
            time = new Date(time);
        }

        // every message you see is actually a table with 3 cols:
        // the time,
        // the person who caused the event,
        // and the content
        text = util.toStaticHTML(text);

        var curMsg = "";
        if (from == "") {
            curMsg = util.timeString(time) + " tip: " + text + '\n';
        } else {
            curMsg = util.timeString(time) + " " + util.toStaticHTML(from) + " says to " + name + ": " + text + "\n";
        }

        this.msgLabel.string = this.msgLabel.string + curMsg;

        this.scrollDown();
    },

    scrollDown: function() {
        cc.log("chat.scrollDown(): is called.");

        var content = this.scrollViewMsg.content;
        if (content.height <= this.scrollViewMsg.node.height) {
            cc.log("chat.scrollDown(): return false ")
            return;
        }

        this.scrollViewMsg.scrollToBottom();
    },

    tip: function(type, name) {
        var tip, title;
        switch(type) {
            case 'online':
                tip = name + ' is online now.';
                title = 'Online Notify';
                break;
            case 'offline':
                tip = name + ' is offline now.';
                title = 'Offline Notify';
                break;
            case 'message':
                tip = name + ' is saying now.';
                title = 'Message Notify';
                break;
        }
        this.addMessage("", "", title + " " + tip);
    },

    initUserList: function(data) {
        cc.log('ChatClient.initUserList() is called.');

        this.users = data.users;
        this.users.splice(0, 0, "all");
        var tip = 'Users currently in ' + this.roomName + ': ';
        for (var i = 0; i < this.users.length; i++) {
            cc.log('users ' +i +': ' +this.users[i]);
            tip += this.users[i] + ',';
        }
        this.addMessage("", "", tip);
    },

    // add user in user list
    addUser: function(user) {
        cc.log("chat.addUser(): user is " +user);
        this.users[this.users.length] = user;
        this.userListView.setUsers(this.users);
    },

    // remove user from user list
    removeUser: function(user) {
        cc.log('chat.removeUser: user=' +user);
        var index = -1;
        for (var i = 0; i < this.users.length; i++) {
            if (this.users[i] == user) {
                index = i;
                break;
            }
        }
        if (index != -1) {
            this.users.splice(index, 1);
        }

        this.userListView.setUsers(this.users);

        var target = this.targetLabel.string;
        if (target == user) {
            this.targetLabel.string = "all";
        }
    },

    showUserList: function() {
        cc.log('chat.showUserList() is called');

        this.isShowUser = !this.isShowUser;
        if (this.isShowUser) {
            this.userListView.setUsers(this.users);
            this.userListView.show();
        } else {
            this.userListView.hide();
        }

    },

    chooseUser: function(index) {
        cc.log('chat.chooseUser: index=' +index);
        this.isShowUser = false;
        this.targetLabel.string = this.users[index];
        this.userListView.hide();
    },

    sendMsg: function() {
        cc.log("ChatClient.sendMsg()");

        var self = this;
        var msg = self.edtMsg.string.replace("\n", "");
        if (msg.length == 0) {
            self.showError(MSG_ERROR);
            return;
        }

        if (msg.charAt(0) == '/') {
            var sysMsg = self.processCommand(msg);
            if (sysMsg) {
                self.addMessage('', '', sysMsg);
            }
            return;
        }

        var route = "chat.chatHandler.send";
        var target = self.targetLabel.string;
        if (target == 'all') {
            target = '*';
        }

        var username = self.userName;

        if (!util.isBlank(msg)) {
            pomelo.request(route, {
                rid: self.roomName,
                content: msg,
                from: username,
                target: target
            }, function(data) {
                if (target != '*' && target != username) {
                    self.addMessage(username, target, msg);
                }
            });
        }
    },

    processCommand: function(msg) {
        var self = this;
        var words = msg.split(' ');
        var command = words[0].substring(1, words[0].length).toLowerCase();
        var ret = false;

        switch(command) {
            case 'join':
                words.shift();
                let room = words.join(' ');
                self.changeRoom(room);
                break;
            case 'nick':
                words.shift();
                let name = words.join(' ');
                self.changeName(name);
                break;
            default:
                ret = 'Unrecognized command.';
                break;
        }
        return ret;
    },

    changeRoom: function(room) {
        var self = this;

        var route = "chat.chatHandler.changeRoom";
        var username = self.userName;

        pomelo.request(route, {
            rid: room,
            username: self.userName,
        }, function(data) {
            cc.log("ChatClient.changeRoom: user: " +data.users);
        });
    },

    changeName: function(name) {

    },

    showError: function(content) {
        cc.log("ChatClient.showError: ", content);
    },


});

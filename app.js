var express = require('express');
var zookeeper = require('node-zookeeper-client');
var httpProxy = require('http-proxy');
var cluster = require('cluster');
var os = require('os');


var CONNECTION_STRING = '127.0.0.1:2181,127.0.0.1:2182,127.0.0.1:2183';
var REGISTRY_ROOT = '/registry';
// zk连接
var zk = zookeeper.createClient(CONNECTION_STRING);
zk.connect();

// 创建代理服务器对象并启动监听错误事件
var proxy = httpProxy.createProxyServer();
proxy.on('error', function (err, req, res) {
    res.end();
});
// web 服务器启动
var port = 1234;
var app = express();
app.use(express.static('public'));
app.all('*', function (req, res) {
    // 处理图标请求
    if (req.path == '/favicon.ico') {
        res.end();
        return;
    }
    // 获取服务名称
    var serviceName = req.get('Service-Name');
    console.log('Service-Name : %s', serviceName);
    if (!serviceName) {
        console.log('Service-Name request header is not exist');
        res.end();
        return;
    }
    // 获取服务路径
    var servicePath = REGISTRY_ROOT + '/' + serviceName;
    console.log('servicePath : %s', servicePath);
    // 获取服务路径下的地址节点
    zk.getChildren(servicePath, function (err, addressNodes) {
        if (err) {
            console.log(err.stack);
            res.end();
            return;
        }

        var size = addressNodes.length;
        if (size == 0) {
            console.log('addrsss node is not exist');
            res.end();
            return;
        }
        // 生成地址路径
        var addressPath = servicePath + '/';
        // 若只有一个地址，则获取改地址
        if (size == 1) {
            addressPath += addressNodes[0];
        } else {
            // 如果存在多个地址，则随机获取一个地址
            addressPath += addressNodes[parseInt(Math.random() * size)];
        }
        console.log('addressPath: %s', addressPath);

        zk.getData(addressPath, function (err, serviceAddress) {
            if (err) {
                console.log(err.stack);
                res.end();
                return;
            }
            console.log('serviceAddress : %s', serviceAddress);
            if (!serviceAddress) {
                console.log('service address is not exist');
                res.end();
                return;
            }
            // 执行反向代理
            proxy.web(req, res, {
                target: 'http://' + serviceAddress //目标地址
            });
        });
    });
});


// 负载均衡[开启集群服务]
var CPUS = os.cpus().length;
if (cluster.isMaster) {
    for (var i = 0; i < CPUS; i++) {
        cluster.fork();
    }
    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });

} else {
    console.log(cluster.worker.id);
    app.listen(port, function () {
        console.log('子进程'+cluster.worker.id+'server is running at %d', port);
    });
}

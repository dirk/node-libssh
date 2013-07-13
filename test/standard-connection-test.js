const libssh = require('../')
    , test   = require('tap').test
    , SSH2   = require('ssh2')
    , fs     = require('fs')
    , bl     = require('bl')

    , privkey = fs.readFileSync(
        '/home/rvagg/git/node-libssh/test/keys/id_rsa')
    , pubkey  = fs.readFileSync(
        '/home/rvagg/git/node-libssh/test/keys/id_rsa.pub')

function executeServerTest (t, connectOptions, authCb, channelCb, connectionCb) {
  var server = libssh.createServer({
      hostRsaKeyFile : __dirname + '/keys/host_rsa'
    , hostDsaKeyFile : __dirname + '/keys/host_dsa'
  })

  server.on('connection', function (session) {
    t.ok(session, 'have a session object!')
    session.on('auth', function (message) {
      t.ok(session, 'have a message object, triggered "auth" event')
      authCb(message)
    })
    session.on('channel', function (channel) {
      t.ok(channel, 'have a channel!')
      channelCb(channel, session)
      channel.on('end', function () {
        t.pass('got "end" event')
      })

      /*
      channel.on('exec', function (message) { })
      channel.on('subsystem', function (message) { })
      channel.on('pty', function (message) { })
      channel.on('shell', function (message) { })
      */
    })
  })

  server.listen(3333, function () {
    var connection = new SSH2()
    connection.connect(connectOptions)
    connection.on('ready', function () {
      connectionCb(connection)
    })
    connection.on('connect', function () { })
    connection.on('error', function (err) {
      console.error('connection error')
      t.fail(err)
    })
    connection.on('end', function () {
    })
    connection.on('close', function () {
      server.close()
      setTimeout(function () {
        t.pass('closing')
        t.end()
      }, 100)
    })
  })

  return server
}
executeServerTest.plan = 7

// priv/pub key auth + pipe a file in to the session and verify it got there
false && test('test standard pub/privkey connection', function (t) {
  t.plan(executeServerTest.plan + 4)

  var connectOptions = {
      host: 'localhost'
    , port: 3333
    , username: 'foobar'
    , privateKey: privkey
    //, debug: console.error
  }

  function authCb (message) {
    if (message.comparePublicKey(pubkey))
      return message.replyAuthSuccess()

    t.fail('comparePublicKey did not work!')
  }

  function channelCb (channel) {
    channel.on('pty', function (message) {
      t.pass('triggered "pty" event')
      message.replySuccess()
    })
    channel.on('shell', function (message) {
      t.pass('triggered "shell" event')
      message.replySuccess()
    })
    channel.pipe(bl(function (err, data) {
      t.notOk(err, 'no error')
      t.equal(data.toString(), fs.readFileSync('/etc/passwd').toString(), 'same data!')
    }))
  }

  function connectionCb (connection) {
    connection.shell(function (err, stream) {
      t.notOk(err, 'no error')
      t.ok(stream, 'has stream')
      fs.createReadStream('/etc/passwd')
        .pipe(stream)
        .on('close', function () {
          connection.end()
        })
    })
  }

  executeServerTest(t, connectOptions, authCb, channelCb, connectionCb)
})

// password auth + with stream going the other way
test('test standard password connection', function (t) {
  t.plan(executeServerTest.plan + 3)

  var connectOptions = {
          host: 'localhost'
        , port: 3333
        , username: 'foobar'
        , password: 'doobar'
        //, debug: console.error
      }
    , server
    , connection
    , clientchannel

  function authCb (message) {
    if (message.authUser === 'foobar' && message.authPassword === 'doobar')
      return message.replyAuthSuccess()
    t.fail('comparePublicKey did not work!')
  }

  function channelCb (channel) {
    channel.on('pty', function (message) {
      t.pass('triggered "pty" event')
      message.replySuccess()
    })
    channel.on('shell', function (message) {
      t.pass('triggered "shell" event')
      message.replySuccess()

      console.log('piping /etc/passwd to channel')
      fs.createReadStream('/etc/passwd')
        .on('close', function () {
          connection.end()
        })
        .pipe(channel)
    })
  }

  function connectionCb (_connection) {
    connection = _connection
    connection.shell(function (err, stream) {
      clientchannel = stream
      t.notOk(err, 'no error')
      t.ok(stream, 'has stream')

      stream.pipe(bl(function (err, data) {
        t.notOk(err, 'no error')
        t.equal(data.toString(), fs.readFileSync('/etc/passwd').toString(), 'same data!')
      }))
    })
  }

  server = executeServerTest(t, connectOptions, authCb, channelCb, connectionCb)
})
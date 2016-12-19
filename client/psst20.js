
var pairing      = "abcd1234abcd1234";
var creator      = 1;
var salsa20key   = [];
var salsa20nonce = [];
var noncestr = "";

var outbuffer = "";
var state1;
var state2;
var needTimeout = 1;

var socket;
var status = 0;

var serverhost = 'psst.ph4.se';
if (window.location.href.substr(0,4) == "file")
  serverhost = 'localhost';

function newchat(password) {
  // Generate nonce
  for (var i = 0; i < 8; i++) {
    salsa20nonce[i] =
      (new Date().getTime() + Math.floor(Math.random() * 256)) % 256;
    noncestr += String.fromCharCode(Math.floor(salsa20nonce[i] / 16) + 97);
    noncestr += String.fromCharCode(Math.floor(salsa20nonce[i] % 16) + 97);
  }
  
  // Set key
  for (var i = 0; i < 32; i++) {
    salsa20key[i] = password.charCodeAt(i % password.length);
  }
}

function attach(s,password) {

  // Pairing from URL
  pairing = s.substr(0,16);

  // Key from password
  for (var i = 0; i < 32; i++) {
    salsa20key[i] = password.charCodeAt(i % password.length);
  }

  // Nonce from URL
  noncestr = s.substr(16);
  for (var i = 0; i < 8; i++) {
    salsa20nonce[i] =
      (noncestr.charCodeAt(i*2) - 97) * 16 +
      (noncestr.charCodeAt(i*2+1) - 97);
  }
  // Flip the last bit in the nonce, like TXRX on twisted pair ethernet
  salsa20nonce[7] ^= 0x01;
}

function init() {
  // Connect to WS server
  socket = new WebSocket('ws://'+serverhost+':7778');
  socket.onopen = connected;
  socket.onerror = function(){$('#remotebox').html("Error connecting..");};
  socket.onclose = function(){$('#remotebox').html("Connection closed..");};
  socket.onmessage = gotData;

  $('#localbox').html("Connecting to server..");
  $('#remotebox').html("Waiting for remote party..");
  
  // Init stream cipher (encryption)
  state1 = new Salsa20(salsa20key, salsa20nonce);
  // Flip nonce so that it's is never reused
  salsa20nonce[7] ^= 0x01;
  state2 = new Salsa20(salsa20key, salsa20nonce);
}

function connected() {
  // Join or create?
  // Send proper HELLO to server
  socket.send( pairing );
}

function gotData (event) {
  var message = event.data;

  if (status == 0) {
    // Remote ID (or YES, you have joined)
    
    pairing = message;
    
    if (creator) {
      url = "http://"+serverhost+"/#" + pairing + noncestr;
      $('#localbox').html("Send this link to your friend.\nThe link can only be used once.\n\n" + url);
    } else if (message == "ERROR") {
      $('#localbox').html("This session has already been closed.. Try again!");
    }
    
    status = 1;
    return;
  }

  if (status == 1) {
  
    // Remote has connected!
    console.log( "Remote has connected!" );
    $('.chatbox').css('background-color','#FFFFFF');
    $('.chatbox').html('_');

    // Send static hello for key validation
    outbuffer = 'key is valid';
    bufferaway();
    
    status = 2;
    return;
  }

  // Static encrypted hello to be able to detect password mismatch
  if (status == 2) {

    var cipher = state2.getBytes(message.length);
    var s = '';
    for (var i = 0; i < message.length; i++) {
      s += String.fromCharCode(message[i].charCodeAt(0) ^ cipher[i]);
    }

    if (s != 'key is valid') {
      $('#localbox').html( "INCORRECT PASSWORD ENTERED BY EITHER YOU OR REMOTE..\nTRY AGAIN!" );
      socket.close();
      status = 99;
      return;
    }
    
    // Alert the user that connection is now setup
    if (creator)
      alert( 'Remote has connected successfully!' );
    
    status = 3;
    return;
  }
  
  // Chat data
  if (status > 2) {
    received( message );
    return;
  }
}

function putchar(k,id) {
  if (k == "\r")
    k = "\n";

  if (k == "\b")
    $(id).html( $(id).html().substr(0,$(id).html().length-2)+ "_" );
  else
    $(id).html( $(id).html().substr(0,$(id).html().length-1)+k+ "_" );
    //$(id).append( k );

  $(id).scrollTop($(id)[0].scrollHeight);
}

function keypressed(k) {

  if (status != 3) return;

  putchar(k,"#localbox");

  outbuffer = outbuffer + k;

  if (needTimeout) {
    setTimeout(bufferaway, 700);
    needTimeout = 0;
  };

  // Did we finish a sentense?
  if (!((k >= "a" && k <= "z") || (k >= "A" && k <= "Z")))
    bufferaway();
}

function chat() {
  // Show chat windows..
  $('#chat').show();

  $('body').keydown(function(event){
    // Deny backspace
    if (event.keyCode == 8) {
      event.preventDefault();
      keypressed( "\b" );
    }
  });

  $('body').keypress(function(event){
    event.preventDefault();
    
    if ( event.keyCode == 13)
      keypressed( "\n" );
    else if ( event.keyCode == 8)
      return; //keypressed( "\b" );
    else
      keypressed( String.fromCharCode(event.charCode) );
  });
}

function bufferaway() {
  // Send code
  if (outbuffer) {
    var s = "";
    var cipher = state1.getBytes(outbuffer.length);
    for (var i = 0; i < outbuffer.length; i++) {
      s += String.fromCharCode(outbuffer[i].charCodeAt(0) ^ cipher[i]);
    }
    
    socket.send( s );
    //received(s)
  }
  outbuffer = "";
  needTimeout = 1;
}

function received(s) {
  // Receive code.. 
  var cipher = state2.getBytes(s.length);
  for (var i = 0; i < s.length; i++) {
    putchar(String.fromCharCode(s[i].charCodeAt(0) ^ cipher[i]),'#remotebox');
  }
}

$(document).ready(function(){

  // Join chat?

  if (window.location.hash) {
    // Ask for password to existing chat
    $('.welcome').hide();
    $('.joinbox').show();
    $('#joinpassword').focus();
    $('#joinform').submit(function(event){
      event.preventDefault();

      attach(window.location.hash.substr(1),$('#joinpassword').val());
      $('#joinpassword').val('');
      // Connect to WS
      creator = 0;
      init();
      // Start the actual chat
      chat();

      $('.joinbox').remove();
    });
  } else {
    $('.welcome').show();
    $('#createpassword').focus();
    $('#createform').submit(function(event){
      event.preventDefault();
      
      // Ask for password to new chat
      newchat($('#createpassword').val());
      $('#createpassword').val('');
      // Connect to WS
      init();
      // Start the actual chat
      chat();

      $('.welcome').remove();
    });
  }
});

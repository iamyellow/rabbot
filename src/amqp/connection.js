var amqp = require( 'amqplib' ),
	_ = require( 'lodash' ),
	when = require( 'when' ),
	AmqpConnection = require( 'amqplib/lib/callback_model' ).CallbackModel,
	Promiser = require( './promiseMachine.js');

var getOption = function( opts, key, alt ) {
		if( opts.get ) {
			return opts.get( key, alt );
		} else {
			return opts[ key ] || alt;
		}
	},
	getUri = function( protocol, user, pass, server, port, vhost, heartbeat ) {
		return protocol + user + ':' + pass +
			'@' + server + ':' + port + '/' + vhost +
			'?heartbeat=' + heartbeat;
	},
	split = function( x ) {
		if( _.isNumber( x ) ) {
			return [ x ];
		} else if( _.isArray( x ) ) {
			return x;
		} else {
			return x.split( ',' ).map( trim );
		}
	},
	trim = function( x ) { return x.trim( ' ' ); };

var Adapter = function( parameters ) {
	var serverList = getOption( parameters, 'RABBIT_BROKER' ) || getOption( parameters, 'server', 'localhost' ),
		portList = getOption( parameters, 'RABBIT_PORT', 5672 );

	this.name = parameters ? ( parameters.name || 'default' ) : 'default';
	this.connectionIndex = 0;
	this.servers = split( serverList );
	this.ports = split( portList );
	this.heartbeat = getOption( parameters, 'RABBIT_HEARTBEAT' ) || getOption( parameters, 'heartbeat', 2000 );
	this.protocol = getOption( parameters, 'RABBIT_PROTOCOL' ) || getOption( parameters, 'protocol', 'amqp://' );
	this.pass = getOption( parameters, 'RABBIT_PASSWORD' ) || getOption( parameters, 'pass', 'guest' );
	this.user = getOption( parameters, 'RABBIT_USER' ) || getOption( parameters, 'user', 'guest' );
	this.vhost = getOption( parameters, 'RABBIT_VHOST' ) || getOption( parameters, 'vhost', '%2f' );
	this.limit = _.max( [ this.servers.length, this.ports.length ] );
};

Adapter.prototype.connect = function() {
	return when.promise( function( resolve, reject ) {
		var attempted = [],
			attempt;	
		attempt = function() {
			var nextUri = this.getNextUri();
			if( _.indexOf( attempted, nextUri ) < 0 ) {
				amqp.connect( nextUri, { noDelay: true } )
					.then( resolve )
					.then( null, function( err ) {
						attempted.push( nextUri );
						this.bumpIndex();
						attempt( err );
					}.bind( this ) );
			} else {
				reject( 'No endpoints could be reached' );
			}
		}.bind( this );
		attempt();
	}.bind( this ) );
};

Adapter.prototype.bumpIndex = function() {
	if( this.limit - 1 > this.connectionIndex ) {
		this.connectionIndex ++;
	} else {
		this.connectionIndex = 0;
	}
};

Adapter.prototype.getNextUri = function() {
	var server = this.getNext( this.servers ),
		port = this.getNext( this.ports );
		uri = getUri( this.protocol, this.user, this.pass, server, port, this.vhost, this.heartbeat );
	return uri;
};

Adapter.prototype.getNext = function( list ) {
	if( this.connectionIndex >= list.length ) {
		return list[ 0 ];
	} else {
		return list[ this.connectionIndex ];
	}
};

module.exports = function( options ) {
		var close = function( connection ) {
			connection.close();
		};
		var adapter = new Adapter( options );
		return Promiser( adapter.connect.bind( adapter ), AmqpConnection, close, 'close' );
};
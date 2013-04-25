#!/usr/bin/perl
use strict;
use Data::Dumper;
use Plack::Builder;
use Plack::App::File;
use Plack::Builder::Conditionals;
use FindBin;
use lib $FindBin::Bin;

use API;
use API::Charts;
use API::Peers;
use Web;
use Web::Query;
use Web::API;
use Web::GoogleDatasource;
use Web::GoogleDashboard;
use Web::Mobile;

my $config_file = '/etc/elsa_web.conf';
if ($ENV{ELSA_CONF}){
	$config_file = $ENV{ELSA_CONF};
}

my $api = API->new(config_file => $config_file) or die('Unable to start from given config file.');
my $charts_api = API::Charts->new(config_file => $config_file) or die('Unable to start from given config file.');
my $peers_api = API::Peers->new(config_file => $config_file) or die('Unable to start from given config file.');

my $auth;
if (lc($api->conf->get('auth/method')) eq 'ldap' and $api->conf->get('ldap')){
	require Authen::Simple::LDAP;
	$auth = Authen::Simple::LDAP->new(
		host        => $api->conf->get('ldap/host'),
		binddn      => $api->conf->get('ldap/bindDN'),
		bindpw      => $api->conf->get('ldap/bindpw'),
		basedn        => $api->conf->get('ldap/base'),
		filter => '(&(objectClass=organizationalPerson)(objectClass=user)(sAMAccountName=%s))',
		log => $api->log,
	);
}
elsif ($api->conf->get('auth/method') eq 'local_ssh'){
	require Authen::Simple::SSH;
	$auth = Authen::Simple::SSH->new(
		host => 'localhost'
	);
}
elsif ($api->conf->get('auth/method') eq 'local'){
	$api->log->logdie('Auth method "local" is no longer implemented, halting.');
}
elsif ($api->conf->get('auth/method') eq 'none'){
	# Inline a null authenticator
	package Authen::Simple::Null;
	use base qw(Authen::Simple::Adapter);
	__PACKAGE__->options({log => {
		type     => Params::Validate::OBJECT,
		can      => [ qw[debug info error warn] ],
		default  => Authen::Simple::Log->new,
		optional => 1}});
	sub check { my $self = shift; $self->log->debug('Authenticating: ', join(', ', @_)); return 1; }
	package main;
	$auth = Authen::Simple::Null->new(log => $api->log);
}
elsif ($api->conf->get('auth/method') eq 'db'){
	package Authen::Simple::ELSADB;
	use base qw(Authen::Simple::DBI);
	
	sub check {
		my ( $self, $username, $password ) = @_;
		my ( $dsn, $dbh, $sth ) = ( $self->dsn, undef, undef );

		unless ( $dbh = DBI->connect( $dsn, $self->username, $self->password, $self->attributes ) ) {
			my $error = DBI->errstr;
			$self->log->error( qq/Failed to connect to database using dsn '$dsn'. Reason: '$error'/ ) if $self->log;
		}
		
		$sth = $dbh->prepare($self->statement);
		$sth->execute($username, $password);
		my $row = $sth->fetchrow_arrayref;
		if ($row){
			return 1;
		}
		
		return 0;
    }
    
	package main;
	$auth = Authen::Simple::ELSADB->new(
		dsn => $api->conf->get('auth_db/dsn') ? $api->conf->get('auth_db/dsn') : $api->conf->get('meta_db/dsn'),
		username =>	$api->conf->get('auth_db/username') ? $api->conf->get('auth_db/username') : $api->conf->get('meta_db/username'),
		password => defined $api->conf->get('auth_db/password') ? $api->conf->get('auth_db/password') : $api->conf->get('meta_db/password'),
		log => $api->log,
		statement => $api->conf->get('auth_db/auth_statement') ? $api->conf->get('auth_db/auth_statement') : 'SELECT uid FROM users WHERE username=? AND password=PASSWORD(?)',
	);
}
elsif ($api->conf->get('auth/method') eq 'security_onion'){
	# Inline a Security Onion authenticator
	package Authen::Simple::SecurityOnion;
	use base qw(Authen::Simple::DBI);
	sub check {
		my ( $self, $username, $password ) = @_;

		my ( $dsn, $dbh, $sth, $encrypted ) = ( $self->dsn, undef, undef, undef );

		unless ( $dbh = DBI->connect( $dsn, $self->username, $self->password, $self->attributes ) ) {
			my $error = DBI->errstr;
			$self->log->error( qq/Failed to connect to database using dsn '$dsn'. Reason: '$error'/ ) if $self->log;
		}
		
		my $salt = substr($password, 0, 2);
		my $query = 'SELECT username FROM user_info WHERE username=? AND password=CONCAT(SUBSTRING(password, 1, 2), SHA1(CONCAT(?, SUBSTRING(password, 1, 2))))';
		$sth = $dbh->prepare($query);
		$sth->execute($username, $password);
		my $row = $sth->fetchrow_arrayref;
		if ($row){
			return 1;
		}

		return 0;
    }

	package main;
	$auth = Authen::Simple::SecurityOnion->new(
		dsn => $api->conf->get('auth_db/dsn') ? $api->conf->get('auth_db/dsn') : $api->conf->get('meta_db/dsn'),
		username =>	$api->conf->get('auth_db/username') ? $api->conf->get('auth_db/username') : $api->conf->get('meta_db/username'),
		password => defined $api->conf->get('auth_db/password') ? $api->conf->get('auth_db/password') : $api->conf->get('meta_db/password'),
		log => $api->log,
		statement => ' ', #hardcoded in module above
	);
}
elsif (lc($api->conf->get('auth/method')) eq 'kerberos' and $api->conf->get('kerberos')){
	require Authen::Simple::Kerberos;
	$auth = Authen::Simple::Kerberos->new(
		realm => $api->conf->get('kerberos/realm'),
		log => $api->log,
	);
}
else {
	die('No auth method, please configure one!');
}

my $static_root = $FindBin::Bin . '/../';
if (exists $ENV{DOCUMENT_ROOT}){
	$static_root = $ENV{DOCUMENT_ROOT} . '/../';
}

builder {
	$ENV{PATH_INFO} = $ENV{REQUEST_URI}; #mod_rewrite will mangle PATH_INFO, so we'll set this manually here in case it's being used
	#enable 'ForwardedHeaders';
	enable 'NoMultipleSlashes';
	enable 'Static', path => qr{^/?inc/}, root => $static_root;
	enable 'CrossOrigin', origins => '*', methods => '*', headers => '*';
	enable 'Session', store => 'File';
	unless ($api->conf->get('auth/method') eq 'none'){
		enable match_if all( path('!', '/favicon.ico'), path('!', qr!^/inc/!), path('!', qr!^/transform!), path('!', qr!^/API/!) ), 'Auth::Basic', authenticator => $auth, realm => $api->conf->get('auth/realm');
	}
	
	mount '/API' => Web::API->new(api => $peers_api)->to_app;
	if (not $api->conf->get('api_only')){
		mount '/favicon.ico' => sub { return [ 200, [ 'Content-Type' => 'text/plain' ], [ '' ] ]; };
		mount '/Query' => Web::Query->new(api => $api)->to_app;
		mount '/datasource' => Web::GoogleDatasource->new(api => $charts_api)->to_app;
		mount '/dashboard' => Web::GoogleDashboard->new(api => $charts_api)->to_app;
		mount '/Charts' => Web::Query->new(api => $charts_api)->to_app;
		mount '/m' => Web::Mobile->new(api => $api)->to_app;
		mount '/' => Web->new(api => $api)->to_app;
	}
};



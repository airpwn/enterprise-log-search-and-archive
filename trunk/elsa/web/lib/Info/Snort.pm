package Info::Snort;
use Moose;
use Data::Dumper;
extends 'Info';
has 'sid' => (is => 'rw', isa => 'Int', required => 1);
has 'gid' => (is => 'rw', isa => 'Int');
has 'rev' => (is => 'rw', isa => 'Int');
has 'plugins' => (is => 'rw', isa => 'ArrayRef', required => 1, default => sub { [qw(getPcap)] });

sub BUILDARGS {
	my ($class, %args) = @_;
	$args{data}->{sig_sid} =~ /(\d+):(\d+):(\d+)/;
	$args{gid} = $1;
	$args{sid} = $2;
	$args{rev} = $3;
	return \%args;
}

sub BUILD {
	my $self = shift;
	if ($self->conf->get('info/snort/url_templates')){
		foreach my $template (@{ $self->conf->get('info/snort/url_templates') }){
			push @{ $self->urls }, sprintf($template, $self->sid);
		}
	}
}

1;
def create_travel_blueprint(base_dir):
    """Create and configure the travel blueprint.
    
    Args:
        base_dir: Absolute path to the application directory
    
    Returns:
        Configured Flask Blueprint
    """
    travel_bp = Blueprint(
        "travel",
        __name__,
        # Remove or comment out the url_prefix line:
        # url_prefix="/travel",
        template_folder=os.path.join(base_dir, 'templates')
    )
    
    # Rest of the function remains the same...
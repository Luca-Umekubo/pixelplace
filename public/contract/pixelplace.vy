# @version 0.3.7

struct Pixel:
    color: uint8  # 4 bits for color (16 colors), but using uint8 for simplicity

# Canvas configuration
CANVAS_WIDTH: constant(uint256) = 100
CANVAS_HEIGHT: constant(uint256) = 100
MAX_PIXELS_PER_TRANSACTION: constant(uint256) = 25
CANVAS_SIZE: constant(uint256) = CANVAS_WIDTH * CANVAS_HEIGHT

# Events
event PixelsUpdated:
    user: indexed(address)
    count: uint256

# Storage
canvas: HashMap[uint256, uint8]  # Maps position to color
last_update_time: HashMap[address, uint256]  # Last update time per user
cool_down_period: uint256  # Cool down period in seconds

# Owner
owner: address

@external
def __init__():
    """
    Initialize the contract with a default canvas
    """
    self.owner = msg.sender
    self.cool_down_period = 60  # 1 minute cool down by default

@pure
@internal
def _get_index(x: uint256, y: uint256) -> uint256:
    """
    Convert x,y coordinates to a single index
    """
    assert x < CANVAS_WIDTH, "X coordinate out of bounds"
    assert y < CANVAS_HEIGHT, "Y coordinate out of bounds"
    return y * CANVAS_WIDTH + x

@view
@external
def get_pixel(x: uint256, y: uint256) -> uint8:
    """
    Get the color of a pixel at position (x,y)
    """
    index: uint256 = self._get_index(x, y)
    return self.canvas[index]

@view
@external
def get_canvas_dimensions() -> (uint256, uint256):
    """
    Returns the dimensions of the canvas
    """
    return CANVAS_WIDTH, CANVAS_HEIGHT

@external
def set_pixels(x_coords: DynArray[uint256, MAX_PIXELS_PER_TRANSACTION], 
               y_coords: DynArray[uint256, MAX_PIXELS_PER_TRANSACTION], 
               colors: DynArray[uint8, MAX_PIXELS_PER_TRANSACTION]):
    """
    Set multiple pixels in a single transaction
    """
    # Ensure arrays have the same length
    assert len(x_coords) == len(y_coords), "Coordinate arrays must have the same length"
    assert len(x_coords) == len(colors), "Coordinate and color arrays must have the same length"
    assert len(x_coords) <= MAX_PIXELS_PER_TRANSACTION, "Too many pixels in a single transaction"
    
    # Check if user can update pixels (cool down period)
    assert block.timestamp >= self.last_update_time[msg.sender] + self.cool_down_period, "Cool down period not passed"
    
    # Update pixels
    for i in range(MAX_PIXELS_PER_TRANSACTION):
        if i >= len(x_coords):
            break
            
        # Ensure color is valid (0-15)
        assert colors[i] < 16, "Invalid color index"
        
        index: uint256 = self._get_index(x_coords[i], y_coords[i])
        self.canvas[index] = colors[i]
    
    # Update last update time
    self.last_update_time[msg.sender] = block.timestamp
    
    # Emit event
    log PixelsUpdated(msg.sender, len(x_coords))

@external
def set_cool_down_period(new_period: uint256):
    """
    Set the cool down period
    """
    assert msg.sender == self.owner, "Only owner can set cool down period"
    self.cool_down_period = new_period

@external
def get_cool_down_period() -> uint256:
    """
    Get the current cool down period
    """
    return self.cool_down_period

@view
@external
def can_update(user: address) -> bool:
    """
    Check if a user can update pixels
    """
    return block.timestamp >= self.last_update_time[user] + self.cool_down_period